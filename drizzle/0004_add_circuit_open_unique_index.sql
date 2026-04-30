BEGIN;--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0004: Unique partial index for circuit_open deliveries
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
--   Ensures at most one delivery with status='circuit_open' exists per
--   (event_id, endpoint_id) pair. Prevents race conditions in
--   atomicCircuitOpenCountAndCreate when concurrent workers attempt to
--   create circuit_open delivery records for the same event/endpoint.
--
-- SAFETY:
--   - Uses IF NOT EXISTS for idempotent re-execution
--   - Partial index only applies to circuit_open status rows, no impact on
--     other delivery statuses (multiple failed/success rows are still allowed)
--
-- PREREQUISITES:
--   - Migration 0000 must have created the deliveries table
-- ═══════════════════════════════════════════════════════════════════════════
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_circuit_open_uniq" ON "deliveries" USING btree ("event_id","endpoint_id") WHERE "deliveries"."status" = 'circuit_open';--> statement-breakpoint

COMMIT;
