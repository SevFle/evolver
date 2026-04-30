import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const m4 = readFileSync("drizzle/0004_add_circuit_open_unique_index.sql", "utf-8");
const deliveriesSource = readFileSync(
  "src/server/db/schema/deliveries.ts",
  "utf-8",
);

describe("migration 0004 — circuit_open unique index", () => {
  it("creates the unique partial index deliveries_circuit_open_uniq", () => {
    expect(m4).toContain("CREATE UNIQUE INDEX");
    expect(m4).toContain("deliveries_circuit_open_uniq");
  });

  it("index targets (event_id, endpoint_id) columns", () => {
    expect(m4).toContain('"event_id"');
    expect(m4).toContain('"endpoint_id"');
  });

  it("partial index WHERE clause filters on circuit_open status", () => {
    expect(m4).toContain("'circuit_open'");
    expect(m4).toMatch(/WHERE.*status.*circuit_open/);
  });

  it("uses btree method", () => {
    expect(m4).toContain("USING btree");
  });

  it("uses IF NOT EXISTS for idempotency", () => {
    expect(m4).toContain("IF NOT EXISTS");
  });

  it("is wrapped in a transaction (BEGIN/COMMIT)", () => {
    expect(m4).toContain("BEGIN");
    expect(m4).toContain("COMMIT");
  });
});

describe("migration 0004 — duplicate circuit_open row deduplication", () => {
  it("contains a DELETE statement to remove duplicate circuit_open rows", () => {
    expect(m4).toContain("DELETE FROM deliveries");
  });

  it("DELETE uses USING clause for self-join", () => {
    expect(m4).toMatch(/DELETE FROM deliveries\s+d1\s+USING deliveries\s+d2/);
  });

  it("DELETE joins on event_id and endpoint_id", () => {
    expect(m4).toContain("d1.event_id = d2.event_id");
    expect(m4).toContain("d1.endpoint_id = d2.endpoint_id");
  });

  it("DELETE filters both rows to circuit_open status", () => {
    expect(m4).toContain("d1.status = 'circuit_open'");
    expect(m4).toContain("d2.status = 'circuit_open'");
  });

  it("DELETE keeps the row with the higher id (d1.id < d2.id)", () => {
    expect(m4).toContain("d1.id < d2.id");
  });

  it("DELETE appears before CREATE UNIQUE INDEX", () => {
    const deletePos = m4.indexOf("DELETE FROM deliveries d1");
    const createPos = m4.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_circuit_open_uniq"',
    );
    expect(deletePos).toBeGreaterThan(-1);
    expect(createPos).toBeGreaterThan(-1);
    expect(deletePos).toBeLessThan(createPos);
  });
});

describe("migration 0004 — lock duration documentation", () => {
  it("includes explicit comment about lock duration expectations", () => {
    expect(m4).toMatch(/LOCK DURATION/i);
  });

  it("documents SHARE lock acquisition during index build", () => {
    expect(m4).toMatch(/SHARE\s+lock/i);
  });

  it("documents the CONCURRENTLY alternative and its transaction limitation", () => {
    expect(m4).toContain("CONCURRENTLY");
    expect(m4).toMatch(/cannot.*run.*inside.*transaction|transaction.*block/i);
  });
});

describe("Drizzle schema — deliveries partial unique index", () => {
  it("defines circuitOpenUniqueIdx using uniqueIndex in table third argument", () => {
    expect(deliveriesSource).toContain("circuitOpenUniqueIdx");
    expect(deliveriesSource).toContain("uniqueIndex");
    expect(deliveriesSource).toContain('"deliveries_circuit_open_uniq"');
  });

  it("index is on (eventId, endpointId)", () => {
    expect(deliveriesSource).toMatch(
      /circuitOpenUniqueIdx[\s\S]*?\.on\(table\.eventId,\s*table\.endpointId\)/,
    );
  });

  it("uses eq() for the WHERE clause instead of sql template", () => {
    expect(deliveriesSource).toMatch(
      /circuitOpenUniqueIdx[\s\S]*?\.where\(eq\(table\.status,\s*"circuit_open"\)\)/,
    );
    expect(deliveriesSource).not.toMatch(
      /circuitOpenUniqueIdx[\s\S]*?\.where\(sql`/,
    );
  });

  it("retryQueueIdx also uses eq() instead of sql template", () => {
    expect(deliveriesSource).toMatch(
      /retryQueueIdx[\s\S]*?\.where\(eq\(table\.status,\s*"retry_scheduled"\)\)/,
    );
    expect(deliveriesSource).not.toMatch(
      /retryQueueIdx[\s\S]*?\.where\(sql`/,
    );
  });

  it("imports eq from drizzle-orm", () => {
    expect(deliveriesSource).toContain('import { eq } from "drizzle-orm"');
  });

  it("does NOT import sql (removed unused import)", () => {
    const importLine = deliveriesSource
      .split("\n")
      .find((l) => l.includes('from "drizzle-orm"'));
    expect(importLine).toBeDefined();
    expect(importLine!).not.toContain("sql");
  });
});

describe("0004 snapshot — structural correctness", () => {
  const snapshot = JSON.parse(
    readFileSync("drizzle/meta/0004_snapshot.json", "utf-8"),
  );

  it("snapshot contains deliveries table", () => {
    expect(snapshot.tables["public.deliveries"]).toBeDefined();
  });

  it("snapshot: deliveries has deliveries_circuit_open_uniq index", () => {
    const idx =
      snapshot.tables["public.deliveries"].indexes
        .deliveries_circuit_open_uniq;
    expect(idx).toBeDefined();
  });

  it("snapshot: index is unique btree", () => {
    const idx =
      snapshot.tables["public.deliveries"].indexes
        .deliveries_circuit_open_uniq;
    expect(idx.isUnique).toBe(true);
    expect(idx.method).toBe("btree");
  });

  it("snapshot: index covers event_id and endpoint_id", () => {
    const idx =
      snapshot.tables["public.deliveries"].indexes
        .deliveries_circuit_open_uniq;
    const columns = idx.columns.map((c: { expression: string }) => c.expression);
    expect(columns).toContain("event_id");
    expect(columns).toContain("endpoint_id");
  });

  it("snapshot: index has WHERE clause for circuit_open", () => {
    const idx =
      snapshot.tables["public.deliveries"].indexes
        .deliveries_circuit_open_uniq;
    expect(idx.where).toContain("circuit_open");
  });
});
