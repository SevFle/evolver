BEGIN;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "events" WHERE "endpoint_id" IS NOT NULL AND "endpoint_group_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Data corruption detected: events rows with both endpoint_id AND endpoint_group_id non-null exist. Aborting migration to prevent silent data corruption.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint_group_id" uuid;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "delivery_mode" text NOT NULL DEFAULT 'direct';--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_delivery_mode_check" CHECK (
  CASE
    WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL AND endpoint_group_id IS NULL
    WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL AND endpoint_id IS NULL
    WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
    ELSE false
  END
);--> statement-breakpoint
DROP INDEX IF EXISTS "endpoint_subscriptions_endpoint_event_type_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_subscriptions_direct_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_id","event_type") WHERE "endpoint_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_subscriptions_group_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_group_id","event_type") WHERE "endpoint_group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_subscriptions_fanout_event_type_uniq" ON "endpoint_subscriptions" USING btree ("user_id","event_type") WHERE "endpoint_id" IS NULL AND "endpoint_group_id" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "delivery_mode" text;--> statement-breakpoint
UPDATE "events" SET "delivery_mode" = CASE
  WHEN endpoint_id IS NOT NULL THEN 'direct'
  WHEN endpoint_group_id IS NOT NULL THEN 'group'
  ELSE 'fanout'
END;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET DEFAULT 'direct';--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_target_check";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_delivery_mode_check" CHECK (
  CASE
    WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL AND endpoint_group_id IS NULL
    WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL AND endpoint_id IS NULL
    WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
    ELSE false
  END
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "endpoint_subscriptions_set_updated_at"
  BEFORE UPDATE ON "endpoint_subscriptions"
  FOR EACH ROW
  EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_endpoint_group_id_endpoint_groups_id_fk";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
COMMIT;
