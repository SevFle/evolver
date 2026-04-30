import { describe, it, expect } from "vitest";
import { events } from "@/server/db/schema/events";
import { endpoints } from "@/server/db/schema/endpoints";
import { teams } from "@/server/db/schema/teams";
import {
  deliveryStatusEnum,
  eventStatusEnum,
  endpointStatusEnum,
  userRoleEnum,
} from "@/server/db/schema/enums";

describe("schema field completeness", () => {
  it("events table has endpointId column", () => {
    expect(events.endpointId).toBeDefined();
  });

  it("events table has status column", () => {
    expect(events.status).toBeDefined();
  });

  it("events table has replayedFromEventId column", () => {
    expect(events.replayedFromEventId).toBeDefined();
  });

  it("events table has endpointGroupId column", () => {
    expect(events.endpointGroupId).toBeDefined();
  });

  it("events table has idempotencyKey column", () => {
    expect(events.idempotencyKey).toBeDefined();
  });

  it("endpoints table has signingSecret column", () => {
    expect(endpoints.signingSecret).toBeDefined();
  });

  it("endpoints table has status column", () => {
    expect(endpoints.status).toBeDefined();
  });

  it("teams table has required columns", () => {
    expect(teams.id).toBeDefined();
    expect(teams.name).toBeDefined();
    expect(teams.slug).toBeDefined();
    expect(teams.createdAt).toBeDefined();
    expect(teams.updatedAt).toBeDefined();
  });
});

describe("enum values", () => {
  it("deliveryStatusEnum has all expected values", () => {
    expect(deliveryStatusEnum.enumValues).toEqual([
      "pending",
      "processing",
      "success",
      "failed",
      "retry_scheduled",
      "circuit_open",
      "dead_letter",
    ]);
  });

  it("eventStatusEnum has all expected values", () => {
    expect(eventStatusEnum.enumValues).toEqual([
      "queued",
      "delivering",
      "delivered",
      "failed",
    ]);
  });

  it("endpointStatusEnum has all expected values", () => {
    expect(endpointStatusEnum.enumValues).toEqual([
      "active",
      "degraded",
      "disabled",
    ]);
  });

  it("userRoleEnum has all expected values", () => {
    expect(userRoleEnum.enumValues).toEqual(["owner", "admin", "member"]);
  });
});

describe("delivery_mode type safety", () => {
  it("events schema deliveryMode uses $type for strict typing", async () => {
    const source = await import("fs").then((fs) =>
      fs.promises.readFile("src/server/db/schema/events.ts", "utf-8"),
    );
    expect(source).toMatch(
      /\$type<["']direct["']\s*\|\s*["']group["']\s*\|\s*["']fanout["']>/,
    );
  });

  it("endpoint-subscriptions schema deliveryMode uses $type for strict typing", async () => {
    const source = await import("fs").then((fs) =>
      fs.promises.readFile("src/server/db/schema/endpoint-subscriptions.ts", "utf-8"),
    );
    expect(source).toMatch(
      /\$type<["']direct["']\s*\|\s*["']group["']\s*\|\s*["']fanout["']>/,
    );
  });
});

describe("drizzle config", () => {
  it("references DATABASE_URL_NON_POOLING", async () => {
    const configText = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle.config.ts", "utf-8"),
    );
    expect(configText).toContain("DATABASE_URL_NON_POOLING");
    expect(configText).not.toContain("process.env.DATABASE_URL!");
  });
});

describe("migration SQL completeness", () => {
  it("includes replayed_from_event_id column in events table", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0000_steep_silver_centurion.sql", "utf-8"),
    );
    expect(sql).toContain('"replayed_from_event_id" uuid');
  });

  it("includes events_replayed_from_idx index", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0000_steep_silver_centurion.sql", "utf-8"),
    );
    expect(sql).toContain('"events_replayed_from_idx"');
  });

  it("includes FK on replayed_from_event_id referencing events.id with onDelete set null", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0000_steep_silver_centurion.sql", "utf-8"),
    );
    expect(sql).toContain(
      '"events_replayed_from_event_id_events_id_fk" FOREIGN KEY ("replayed_from_event_id") REFERENCES "public"."events"("id") ON DELETE set null',
    );
  });

  it("includes CHECK constraint for endpointId/endpointGroupId nullability", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0000_steep_silver_centurion.sql", "utf-8"),
    );
    expect(sql).toContain(
      'CONSTRAINT "events_target_check" CHECK ("endpoint_id" IS NOT NULL OR "endpoint_group_id" IS NOT NULL)',
    );
  });

  it("includes uniqueIndex on idempotencyKey composite with userId", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0000_steep_silver_centurion.sql", "utf-8"),
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "events_idempotency_key_idx" ON "events" USING btree ("user_id","idempotency_key")',
    );
    expect(sql).toContain(
      'WHERE "events"."idempotency_key" is not null',
    );
  });
});

describe("0001 incremental migration SQL completeness", () => {
  it("includes FK on replayed_from_event_id referencing events.id with onDelete set null", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0001_giant_squirrel_girl.sql", "utf-8"),
    );
    expect(sql).toContain(
      '"events_replayed_from_event_id_events_id_fk" FOREIGN KEY ("replayed_from_event_id") REFERENCES "public"."events"("id") ON DELETE set null',
    );
  });

  it("includes CHECK constraint for endpointId/endpointGroupId nullability", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0001_giant_squirrel_girl.sql", "utf-8"),
    );
    expect(sql).toContain(
      '"events_target_check" CHECK ("events"."endpoint_id" is not null or "events"."endpoint_group_id" is not null)',
    );
  });

  it("includes uniqueIndex on idempotencyKey composite with userId", async () => {
    const sql = await import("fs").then((fs) =>
      fs.promises.readFile("drizzle/0001_giant_squirrel_girl.sql", "utf-8"),
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "events_idempotency_key_idx" ON "events" USING btree ("user_id","idempotency_key")',
    );
    expect(sql).toContain(
      'WHERE "events"."idempotency_key" is not null',
    );
  });
});

describe("schema relations", () => {
  it("eventsRelations defines self-referential replayedFrom with eventReplayLineage relationName", async () => {
    const source = await import("fs").then((fs) =>
      fs.promises.readFile("src/server/db/schema/relations.ts", "utf-8"),
    );
    expect(source).toContain("replayedFromEventId");
    expect(source).toContain('relationName: "eventReplayLineage"');
    expect(source).toContain("replays: many(events");
  });
});
