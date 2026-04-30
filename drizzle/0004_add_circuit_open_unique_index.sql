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
--
-- LOCK DURATION NOTE:
--   CREATE UNIQUE INDEX acquires a SHARE lock on the deliveries table for the
--   duration of the index build. This blocks writes (INSERT/UPDATE/DELETE) but
--   allows concurrent reads. For large tables, this lock may be held for an
--   extended period, potentially causing delivery processing delays.
--
--   Alternative: CREATE UNIQUE INDEX CONCURRENTLY avoids blocking writes by
--   performing two table scans and taking brief SHARE UPDATE EXCLUSIVE locks.
--   However, CONCURRENTLY cannot run inside a transaction block, which
--   conflicts with Drizzle's default migration runner (wraps in BEGIN/COMMIT).
--   To use CONCURRENTLY, a custom migration runner (e.g., drizzle-orm
--   programmatic migrate with per-statement execution) would be needed.
--   Given the partial index only covers circuit_open rows (expected to be a
--   small subset), the standard approach should complete quickly.
-- ═══════════════════════════════════════════════════════════════════════════
--> statement-breakpoint

-- Deduplicate any existing circuit_open rows before creating the unique index.
-- Keeps the row with the highest id (most recent) per (event_id, endpoint_id).
DELETE FROM deliveries d1 USING deliveries d2
WHERE d1.event_id = d2.event_id
  AND d1.endpoint_id = d2.endpoint_id
  AND d1.status = 'circuit_open'
  AND d2.status = 'circuit_open'
  AND d1.id < d2.id;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_circuit_open_uniq" ON "deliveries" USING btree ("event_id","endpoint_id") WHERE "deliveries"."status" = 'circuit_open';--> statement-breakpoint

COMMIT;
