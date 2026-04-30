import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const migration = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");

describe("migration 0002_happy_mathemanic.sql — endpoint_subscriptions table", () => {
  it("creates the endpoint_subscriptions table", () => {
    expect(migration).toContain('CREATE TABLE "endpoint_subscriptions"');
  });

  it("includes id column as uuid primary key", () => {
    expect(migration).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL');
  });

  it("includes endpoint_id column as uuid not null", () => {
    expect(migration).toContain('"endpoint_id" uuid NOT NULL');
  });

  it("includes user_id column as uuid not null", () => {
    expect(migration).toContain('"user_id" uuid NOT NULL');
  });

  it("includes event_type column as text not null", () => {
    expect(migration).toContain('"event_type" text NOT NULL');
  });

  it("includes is_active column as boolean default true not null", () => {
    expect(migration).toContain('"is_active" boolean DEFAULT true NOT NULL');
  });

  it("includes created_at and updated_at timestamp columns", () => {
    expect(migration).toContain('"created_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migration).toContain('"updated_at" timestamp with time zone DEFAULT now() NOT NULL');
  });
});

describe("migration 0002 — foreign keys", () => {
  it("adds FK from endpoint_id to endpoints.id with cascade delete", () => {
    expect(migration).toContain(
      '"endpoint_subscriptions_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade',
    );
  });

  it("adds FK from user_id to users.id with cascade delete", () => {
    expect(migration).toContain(
      '"endpoint_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    );
  });
});

describe("migration 0002 — indexes", () => {
  it("creates composite index on (user_id, event_type)", () => {
    expect(migration).toContain(
      'CREATE INDEX "endpoint_subscriptions_user_event_type_idx" ON "endpoint_subscriptions" USING btree ("user_id","event_type")',
    );
  });

  it("creates index on endpoint_id", () => {
    expect(migration).toContain(
      'CREATE INDEX "endpoint_subscriptions_endpoint_id_idx" ON "endpoint_subscriptions" USING btree ("endpoint_id")',
    );
  });

  it("creates partial index on (user_id, is_active) where is_active=true", () => {
    expect(migration).toContain(
      'CREATE INDEX "endpoint_subscriptions_active_user_idx" ON "endpoint_subscriptions" USING btree ("user_id","is_active") WHERE "endpoint_subscriptions"."is_active" = true',
    );
  });
});

describe("migration 0002 — unique constraint on (endpoint_id, event_type)", () => {
  it("creates a UNIQUE INDEX on (endpoint_id, event_type)", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_id","event_type")',
    );
  });

  it("uses btree for the unique index", () => {
    const match = migration.match(
      /CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq"[^;]+/s,
    );
    expect(match).not.toBeNull();
    expect(match![0]).toContain("USING btree");
  });

  it("does not include a separate UNIQUE constraint besides the unique index", () => {
    const alterUniqueMatches = migration.match(
      /ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT.*UNIQUE/g,
    );
    expect(alterUniqueMatches).toBeNull();
  });

  it("unique index columns are ordered as endpoint_id then event_type", () => {
    const match = migration.match(
      /CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq"[^;]+/s,
    );
    expect(match).not.toBeNull();
    const statement = match![0];
    const epPos = statement.indexOf('"endpoint_id"');
    const evPos = statement.indexOf('"event_type"');
    expect(epPos).toBeGreaterThan(0);
    expect(evPos).toBeGreaterThan(0);
    expect(epPos).toBeLessThan(evPos);
  });
});

describe("migration 0002 — removes events_target_check", () => {
  it("drops the events_target_check constraint to allow events without direct endpoint", () => {
    expect(migration).toContain(
      'ALTER TABLE "events" DROP CONSTRAINT "events_target_check"',
    );
  });
});

describe("migration 0002 — consistency with schema definition", () => {
  const schemaSource = readFileSync(
    "src/server/db/schema/endpoint-subscriptions.ts",
    "utf-8",
  );

  it("schema and migration agree on table name", () => {
    expect(migration).toContain('"endpoint_subscriptions"');
    expect(schemaSource).toContain('"endpoint_subscriptions"');
  });

  it("migration 0002 creates the old unique index name, schema uses three partial indexes (replaced by 0003)", () => {
    expect(migration).toContain("endpoint_subscriptions_endpoint_event_type_uniq");
    expect(schemaSource).toContain("endpoint_subscriptions_direct_event_type_uniq");
    expect(schemaSource).toContain("endpoint_subscriptions_group_event_type_uniq");
    expect(schemaSource).toContain("endpoint_subscriptions_fanout_event_type_uniq");
  });

  it("schema and migration agree on composite index name", () => {
    expect(migration).toContain("endpoint_subscriptions_user_event_type_idx");
    expect(schemaSource).toContain("endpoint_subscriptions_user_event_type_idx");
  });

  it("schema and migration agree on endpoint index name", () => {
    expect(migration).toContain("endpoint_subscriptions_endpoint_id_idx");
    expect(schemaSource).toContain("endpoint_subscriptions_endpoint_id_idx");
  });

  it("schema and migration agree on active user index name", () => {
    expect(migration).toContain("endpoint_subscriptions_active_user_idx");
    expect(schemaSource).toContain("endpoint_subscriptions_active_user_idx");
  });
});
