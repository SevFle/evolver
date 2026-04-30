import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";

const migration = readFileSync("drizzle/0003_calm_crimson_falcon.sql", "utf-8");

describe("migration 0003 — endpoint_subscriptions delivery_mode column", () => {
  it("drops NOT NULL from endpoint_subscriptions.endpoint_id", () => {
    expect(migration).toContain(
      'ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL',
    );
  });

  it("adds endpoint_group_id column as nullable uuid with IF NOT EXISTS", () => {
    expect(migration).toContain(
      'ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint_group_id" uuid',
    );
  });

  it("adds FK from endpoint_subscriptions.endpoint_group_id to endpoint_groups.id with cascade", () => {
    expect(migration).toMatch(
      /ADD CONSTRAINT.*endpoint_subscriptions_endpoint_group_id.*FOREIGN KEY.*"endpoint_group_id".*REFERENCES.*"endpoint_groups"\("id"\).*ON DELETE cascade/i,
    );
  });

  it("adds delivery_mode column as NOT NULL DEFAULT 'direct' with IF NOT EXISTS", () => {
    expect(migration).toContain(
      'ALTER TABLE "endpoint_subscriptions" ADD COLUMN IF NOT EXISTS "delivery_mode" text NOT NULL DEFAULT \'direct\'',
    );
  });

  it("adds CHECK constraint endpoint_subscriptions_delivery_mode_check", () => {
    expect(migration).toContain(
      'endpoint_subscriptions_delivery_mode_check',
    );
  });
});

describe("migration 0003 — endpoint_subscriptions delivery_mode CHECK logic", () => {
  let checkBlock: string;

  beforeAll(() => {
    const start = migration.indexOf('endpoint_subscriptions_delivery_mode_check');
    const end = migration.indexOf(";", start);
    checkBlock = migration.slice(start, end);
  });

  it("requires endpoint_id when delivery_mode is 'direct'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'direct'.*THEN.*endpoint_id.*IS NOT NULL/s);
  });

  it("requires endpoint_group_id IS NULL when delivery_mode is 'direct'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'direct'.*THEN.*endpoint_id.*IS NOT NULL.*endpoint_group_id.*IS NULL/s);
  });

  it("requires endpoint_group_id when delivery_mode is 'group'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'group'.*THEN.*endpoint_group_id.*IS NOT NULL/s);
  });

  it("requires endpoint_id IS NULL when delivery_mode is 'group'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'group'.*THEN.*endpoint_group_id.*IS NOT NULL.*endpoint_id.*IS NULL/s);
  });

  it("requires both null when delivery_mode is 'fanout'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'fanout'.*THEN.*endpoint_id.*IS NULL.*endpoint_group_id.*IS NULL/s);
  });

  it("rejects any other delivery_mode value with ELSE false", () => {
    expect(checkBlock).toContain("ELSE false");
  });

  it("CHECK constraint uses CASE expression", () => {
    expect(checkBlock).toContain("CASE");
    expect(checkBlock).toContain("END");
  });
});

describe("migration 0003 — events delivery_mode column", () => {
  it("adds delivery_mode column as nullable text initially with IF NOT EXISTS", () => {
    expect(migration).toContain(
      'ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "delivery_mode" text',
    );
  });

  it("backfills delivery_mode based on existing endpoint_id / endpoint_group_id", () => {
    expect(migration).toMatch(
      /UPDATE "events" SET "delivery_mode"\s*=\s*CASE.*WHEN.*endpoint_id.*IS NOT NULL.*THEN.*'direct'.*WHEN.*endpoint_group_id.*IS NOT NULL.*THEN.*'group'.*ELSE.*'fanout'.*END/s,
    );
  });

  it("makes delivery_mode NOT NULL after backfill", () => {
    expect(migration).toContain(
      'ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL',
    );
  });

  it("sets default to 'direct' after backfill", () => {
    expect(migration).toContain(
      'ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET DEFAULT \'direct\'',
    );
  });

  it("adds CHECK constraint events_delivery_mode_check", () => {
    expect(migration).toContain("events_delivery_mode_check");
  });
});

describe("migration 0003 — events delivery_mode CHECK logic", () => {
  let checkBlock: string;

  beforeAll(() => {
    const start = migration.indexOf("events_delivery_mode_check");
    const end = migration.indexOf(";", start);
    checkBlock = migration.slice(start, end);
  });

  it("requires endpoint_id when delivery_mode is 'direct'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'direct'.*THEN.*endpoint_id.*IS NOT NULL/s);
  });

  it("requires endpoint_group_id IS NULL when delivery_mode is 'direct'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'direct'.*THEN.*endpoint_id.*IS NOT NULL.*endpoint_group_id.*IS NULL/s);
  });

  it("requires endpoint_group_id when delivery_mode is 'group'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'group'.*THEN.*endpoint_group_id.*IS NOT NULL/s);
  });

  it("requires endpoint_id IS NULL when delivery_mode is 'group'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'group'.*THEN.*endpoint_group_id.*IS NOT NULL.*endpoint_id.*IS NULL/s);
  });

  it("requires both null when delivery_mode is 'fanout'", () => {
    expect(checkBlock).toMatch(/WHEN.*delivery_mode.*=.*'fanout'.*THEN.*endpoint_id.*IS NULL.*endpoint_group_id.*IS NULL/s);
  });

  it("rejects any other delivery_mode value", () => {
    expect(checkBlock).toContain("ELSE false");
  });
});

describe("migration 0003 — updated_at trigger", () => {
  it("creates set_updated_at function", () => {
    expect(migration).toContain('"set_updated_at"');
    expect(migration).toContain("NEW.\"updated_at\" = now()");
  });

  it("creates trigger on endpoint_subscriptions before update", () => {
    expect(migration).toContain('"endpoint_subscriptions_set_updated_at"');
    expect(migration).toContain("BEFORE UPDATE ON \"endpoint_subscriptions\"");
    expect(migration).toContain("FOR EACH ROW");
  });
});

describe("migration 0003 — statement breakpoints", () => {
  it("uses --> statement-breakpoint separators between all statements", () => {
    const statements = migration.split("--> statement-breakpoint");
    expect(statements.length).toBeGreaterThanOrEqual(8);
  });

  it("each statement is non-empty after trimming", () => {
    const statements = migration
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      expect(stmt.length).toBeGreaterThan(0);
    }
  });
});

describe("migration 0003 — transaction safety", () => {
  it("wraps all statements in BEGIN...COMMIT", () => {
    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("places corruption check before any DDL changes", () => {
    const corruptionPos = migration.indexOf("Data corruption detected");
    const firstAlterTable = migration.indexOf("ALTER TABLE");
    expect(corruptionPos).toBeGreaterThan(-1);
    expect(firstAlterTable).toBeGreaterThan(-1);
    expect(corruptionPos).toBeLessThan(firstAlterTable);
  });

  it("corruption check runs before delivery_mode column is added to events", () => {
    const corruptionPos = migration.indexOf("Data corruption detected");
    const addDeliveryModePos = migration.indexOf(
      'ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "delivery_mode" text',
    );
    expect(corruptionPos).toBeLessThan(addDeliveryModePos);
  });

  it("BEGIN appears before corruption check", () => {
    const beginPos = migration.indexOf("BEGIN;");
    const corruptionPos = migration.indexOf("Data corruption detected");
    expect(beginPos).toBeLessThan(corruptionPos);
  });

  it("COMMIT appears after all DDL and DML statements", () => {
    const commitPos = migration.lastIndexOf("COMMIT;");
    const lastTriggerPos = migration.indexOf("EXECUTE FUNCTION");
    expect(commitPos).toBeGreaterThan(lastTriggerPos);
  });
});

describe("migration 0003 — CHECK constraints are symmetric between tables", () => {
  it("both tables define identical delivery_mode values: direct, group, fanout", () => {
    const subsCheck = migration.match(
      /endpoint_subscriptions_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";
    const eventsCheck = migration.match(
      /events_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";

    const modes = ["direct", "group", "fanout"];
    for (const mode of modes) {
      expect(subsCheck).toContain(`'${mode}'`);
      expect(eventsCheck).toContain(`'${mode}'`);
    }
  });

  it("direct mode requires endpoint_group_id IS NULL in both tables", () => {
    const subsCheck = migration.match(
      /endpoint_subscriptions_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";
    const eventsCheck = migration.match(
      /events_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";

    const directSubs = subsCheck.match(/WHEN.*'direct'.*THEN.*(?=\n|\s)/s)?.[0] ?? "";
    const directEvents = eventsCheck.match(/WHEN.*'direct'.*THEN.*(?=\n|\s)/s)?.[0] ?? "";

    expect(directSubs).toContain("endpoint_group_id IS NULL");
    expect(directEvents).toContain("endpoint_group_id IS NULL");
  });

  it("group mode requires endpoint_id IS NULL in both tables", () => {
    const subsCheck = migration.match(
      /endpoint_subscriptions_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";
    const eventsCheck = migration.match(
      /events_delivery_mode_check[\s\S]*?END/
    )?.[0] ?? "";

    const groupSubs = subsCheck.match(/WHEN.*'group'.*THEN.*(?=\n|\s)/s)?.[0] ?? "";
    const groupEvents = eventsCheck.match(/WHEN.*'group'.*THEN.*(?=\n|\s)/s)?.[0] ?? "";

    expect(groupSubs).toContain("endpoint_id IS NULL");
    expect(groupEvents).toContain("endpoint_id IS NULL");
  });
});

describe("migration 0003 — migration 0002 prerequisite validation", () => {
  it("migration 0002 created endpoint_subscriptions with endpoint_id NOT NULL", () => {
    const m2 = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    expect(m2).toContain('"endpoint_id" uuid NOT NULL');
  });

  it("migration 0002 dropped the old events_target_check constraint", () => {
    const m2 = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    expect(m2).toContain('DROP CONSTRAINT "events_target_check"');
  });

  it("migration 0003 correctly makes endpoint_id nullable after 0002", () => {
    const m2 = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    expect(m2).toContain('"endpoint_id" uuid NOT NULL');
    expect(migration).toContain(
      'ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL',
    );
  });
});

describe("migration 0003 — no accidental table recreation", () => {
  it("does not contain CREATE TABLE for endpoint_subscriptions", () => {
    expect(migration).not.toMatch(/CREATE TABLE.*endpoint_subscriptions/);
  });

  it("does not contain CREATE TABLE for events", () => {
    expect(migration).not.toMatch(/CREATE TABLE.*"events"/);
  });

  it("only uses ALTER TABLE for existing tables", () => {
    const alterMatches = migration.match(/ALTER TABLE/g);
    expect(alterMatches).not.toBeNull();
    expect(alterMatches!.length).toBeGreaterThanOrEqual(4);
  });
});
