BEGIN;--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0003: Delivery Mode & Endpoint Group Subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
--   Introduces delivery_mode (direct|group|fanout) to both events and
--   endpoint_subscriptions, adds endpoint_group_id support to subscriptions,
--   and replaces the old unique index with partial unique indexes per mode.
--
-- SAFETY:
--   - Batched backfill with statement_timeout safety net prevents long locks
--   - All constraint additions wrapped in DO blocks with EXCEPTION WHEN
--     duplicate_object for idempotent re-execution after partial failures
--   - Corruption guard rejects migration if overlapping target data exists
--
-- PREREQUISITES:
--   - Migration 0002 must have created endpoint_subscriptions
--   - Migration 0002 drops events_target_check
-- ═══════════════════════════════════════════════════════════════════════════
--> statement-breakpoint

-- GUARD: Reject migration if any events rows have both endpoint_id AND
-- endpoint_group_id non-null. Such rows would violate the new delivery_mode
-- CHECK constraint (mutual exclusivity).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "events" WHERE "endpoint_id" IS NOT NULL AND "endpoint_group_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Data corruption detected: events rows with both endpoint_id AND endpoint_group_id non-null exist. Aborting migration to prevent silent data corruption.';
  END IF;
END $$;--> statement-breakpoint

-- SUBSCRIPTIONS: Make endpoint_id nullable to support group/fanout modes
ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL;--> statement-breakpoint

-- SUBSCRIPTIONS: Add endpoint_group_id column for group delivery
ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint_group_id" uuid;--> statement-breakpoint

-- SUBSCRIPTIONS: FK from endpoint_group_id to endpoint_groups.id (CASCADE)
-- Wrapped in DO block for idempotent re-execution after partial failure.
DO $$
BEGIN
  ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- SUBSCRIPTIONS: Add delivery_mode column with DEFAULT 'direct'
-- Existing rows inherit 'direct' automatically (safe for pre-existing data).
ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "delivery_mode" text NOT NULL DEFAULT 'direct';--> statement-breakpoint

-- GUARD: Reject migration if any endpoint_subscriptions rows have both
-- endpoint_id AND endpoint_group_id non-null. Such rows would violate the
-- new delivery_mode CHECK constraint (mutual exclusivity).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "endpoint_subscriptions" WHERE "endpoint_id" IS NOT NULL AND "endpoint_group_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Data corruption detected: endpoint_subscriptions rows with both endpoint_id AND endpoint_group_id non-null exist. Aborting migration to prevent silent data corruption.';
  END IF;
END $$;--> statement-breakpoint

-- SUBSCRIPTIONS: CHECK constraint enforcing mutual exclusivity of delivery targets
-- direct: endpoint_id set, endpoint_group_id null
-- group: endpoint_group_id set, endpoint_id null
-- fanout: both null
-- Wrapped in DO block for idempotent re-execution.
DO $$
BEGIN
  ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_delivery_mode_check" CHECK (
    CASE
      WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL AND endpoint_group_id IS NULL
      WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL AND endpoint_id IS NULL
      WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
      ELSE false
    END
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- SUBSCRIPTIONS: Replace old unique index with partial unique indexes per mode
-- Old index (endpoint_id, event_type) cannot handle NULL endpoint_id correctly.
-- Partial indexes with WHERE clauses enforce uniqueness only within each mode.
DROP INDEX IF EXISTS "endpoint_subscriptions_endpoint_event_type_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "endpoint_subscriptions_direct_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_id","event_type") WHERE "endpoint_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "endpoint_subscriptions_group_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_group_id","event_type") WHERE "endpoint_group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "endpoint_subscriptions_fanout_event_type_uniq" ON "endpoint_subscriptions" USING btree ("user_id","event_type") WHERE "user_id" IS NOT NULL AND "endpoint_id" IS NULL AND "endpoint_group_id" IS NULL;--> statement-breakpoint

-- EVENTS: Add delivery_mode column as nullable (backfill follows)
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "delivery_mode" text;--> statement-breakpoint

-- EVENTS: Backfill delivery_mode from existing target columns
-- Uses a cursor-based batched UPDATE approach to avoid holding locks on the
-- entire events table. Each batch tracks max(id) and uses WHERE id > cursor
-- to eliminate re-scanning of already-processed rows. A statement_timeout of
-- 5s acts as a safety net per batch iteration. The CASE WHEN order prioritises
-- endpoint_id (direct) over endpoint_group_id (group) to handle overlap rows
-- where both columns are non-null (caught by the guard above in production,
-- but the priority ensures deterministic classification regardless).
DO $$
DECLARE
  batch_size CONSTANT int := 5000;
  updated_count int := 1;
  total_updated int := 0;
  cursor_id bigint := 0;
  batch_max_id bigint;
BEGIN
  PERFORM set_config('statement_timeout', '5s', true);

  WHILE updated_count > 0 LOOP
    SELECT max(id) INTO batch_max_id FROM (
      SELECT id FROM "events"
      WHERE id > cursor_id AND "delivery_mode" IS NULL
      ORDER BY id
      LIMIT batch_size
    ) batch;

    EXIT WHEN batch_max_id IS NULL;

    UPDATE "events" SET "delivery_mode" = CASE
      WHEN endpoint_id IS NOT NULL THEN 'direct'
      WHEN endpoint_group_id IS NOT NULL THEN 'group'
      ELSE 'fanout'
    END
    WHERE "delivery_mode" IS NULL AND id > cursor_id AND id <= batch_max_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    total_updated := total_updated + updated_count;
    cursor_id := batch_max_id;
  END LOOP;

  PERFORM set_config('statement_timeout', '0', true);

  RAISE NOTICE 'Backfilled delivery_mode for % event rows', total_updated;
END $$;--> statement-breakpoint

-- EVENTS: Promote delivery_mode to NOT NULL after backfill completes
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL;--> statement-breakpoint

-- EVENTS: Set DEFAULT 'direct' for new events
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET DEFAULT 'direct';--> statement-breakpoint

-- EVENTS: Drop old target check, add new delivery_mode check
-- The old events_target_check (from migration 0000/0001) enforced endpoint_id
-- OR endpoint_group_id non-null. The new check enforces mutual exclusivity.
-- DROP uses IF EXISTS as migration 0002 already dropped this constraint.
-- ADD is wrapped in DO block for idempotent re-execution.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_target_check";--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_delivery_mode_check" CHECK (
    CASE
      WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL AND endpoint_group_id IS NULL
      WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL AND endpoint_id IS NULL
      WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
      ELSE false
    END
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- TRIGGER: Auto-set updated_at on endpoint_subscriptions row changes
-- Uses CREATE OR REPLACE FUNCTION for idempotent re-execution.
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DO $$
BEGIN
  CREATE TRIGGER "endpoint_subscriptions_set_updated_at"
    BEFORE UPDATE ON "endpoint_subscriptions"
    FOR EACH ROW
    EXECUTE FUNCTION "set_updated_at"();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- EVENTS: Replace endpoint_group_id FK (SET NULL from migration 0001 → RESTRICT)
-- RESTRICT prevents accidental group deletion while live events reference it.
-- Wrapped in DO block: drops old FK (if exists) then adds new one atomically.
DO $$
BEGIN
  ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_endpoint_group_id_endpoint_groups_id_fk";
  ALTER TABLE "events" ADD CONSTRAINT "events_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

COMMIT;
