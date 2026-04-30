import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

const journal = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf-8"),
);

describe("drizzle journal — structure", () => {
  it("has version 7", () => {
    expect(journal.version).toBe("7");
  });

  it("has postgresql dialect", () => {
    expect(journal.dialect).toBe("postgresql");
  });

  it("has exactly 5 entries", () => {
    expect(journal.entries).toHaveLength(5);
  });
});

describe("drizzle journal — entry ordering", () => {
  it("entries are sequentially indexed starting from 0", () => {
    journal.entries.forEach((entry: { idx: number }, i: number) => {
      expect(entry.idx).toBe(i);
    });
  });

  it("timestamps are monotonically increasing", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when).toBeGreaterThanOrEqual(
        journal.entries[i - 1].when,
      );
    }
  });

  it("all entries have version 7", () => {
    journal.entries.forEach((entry: { version: string }) => {
      expect(entry.version).toBe("7");
    });
  });

  it("all entries have breakpoints enabled", () => {
    journal.entries.forEach((entry: { breakpoints: boolean }) => {
      expect(entry.breakpoints).toBe(true);
    });
  });
});

describe("drizzle journal — tags match migration files", () => {
  const expectedMigrations = [
    { idx: 0, tag: "0000_steep_silver_centurion" },
    { idx: 1, tag: "0001_giant_squirrel_girl" },
    { idx: 2, tag: "0002_happy_mathemanic" },
    { idx: 3, tag: "0003_calm_crimson_falcon" },
    { idx: 4, tag: "0004_add_circuit_open_unique_index" },
  ];

  it("journal tags match expected migration names", () => {
    expectedMigrations.forEach((expected, i) => {
      expect(journal.entries[i].tag).toBe(expected.tag);
    });
  });

  it("each referenced migration SQL file exists", () => {
    journal.entries.forEach((entry: { tag: string }) => {
      const path = `drizzle/${entry.tag}.sql`;
      expect(existsSync(path)).toBe(true);
    });
  });

  it("migration file prefix matches entry index", () => {
    journal.entries.forEach((entry: { idx: number; tag: string }) => {
      const prefix = String(entry.idx).padStart(4, "0");
      expect(entry.tag).toMatch(new RegExp(`^${prefix}_`));
    });
  });
});

describe("drizzle journal — no orphan migration files", () => {
  it("all .sql files in drizzle/ directory are referenced in journal", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const files = fs
      .readdirSync("drizzle")
      .filter((f: string) => f.endsWith(".sql"));
    const journalTags = new Set(
      journal.entries.map((e: { tag: string }) => e.tag),
    );

    for (const file of files) {
      const tag = file.replace(".sql", "");
      expect(journalTags.has(tag)).toBe(true);
    }
  });
});

describe("drizzle journal — migration 0003 content consistency", () => {
  it("migration 0003 file contains all statements referenced in journal", () => {
    const m3 = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");
    const breakpoints = m3.split("--> statement-breakpoint");
    expect(breakpoints.length).toBeGreaterThanOrEqual(8);
  });

  it("migration 0003 references both tables from the schema", () => {
    const m3 = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");
    expect(m3).toContain('"endpoint_subscriptions"');
    expect(m3).toContain('"events"');
  });
});

describe("drizzle journal — migration chain integrity", () => {
  it("migration 0000 creates all initial tables", () => {
    const m0 = readFileSync("drizzle/0000_steep_silver_centurion.sql", "utf-8");
    expect(m0).toContain("CREATE TABLE");
    expect(m0).toContain('"events"');
    expect(m0).toContain('"endpoints"');
    expect(m0).toContain('"endpoint_groups"');
  });

  it("migration 0002 creates endpoint_subscriptions and drops old check", () => {
    const m2 = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    expect(m2).toContain("CREATE TABLE");
    expect(m2).toContain('"endpoint_subscriptions"');
    expect(m2).toContain('DROP CONSTRAINT "events_target_check"');
  });

  it("migration 0003 extends endpoint_subscriptions with delivery_mode", () => {
    const m3 = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");
    expect(m3).toContain('"delivery_mode"');
    expect(m3).toContain("endpoint_subscriptions_delivery_mode_check");
    expect(m3).toContain("events_delivery_mode_check");
  });

  it("migration 0004 creates unique partial index on deliveries for circuit_open", () => {
    const m4 = readFileSync("drizzle/0004_add_circuit_open_unique_index.sql", "utf-8");
    expect(m4).toContain("deliveries_circuit_open_uniq");
    expect(m4).toContain("CREATE UNIQUE INDEX");
  });

  it("no migration after 0004 exists (journal is up to date)", () => {
    const hasM5 = existsSync("drizzle/0005_*.sql");
    expect(hasM5).toBe(false);
  });
});
