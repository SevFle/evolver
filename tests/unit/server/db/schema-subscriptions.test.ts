import { describe, it, expect } from "vitest";
import { endpointSubscriptions } from "@/server/db/schema/endpoint-subscriptions";
import { readFileSync } from "fs";

describe("endpointSubscriptions schema — uniqueIndex on (endpointId, eventType)", () => {
  it("defines three partial unique indexes for each delivery mode", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain("uniqueIndex");
    expect(source).toContain("endpoint_subscriptions_direct_event_type_uniq");
    expect(source).toContain("endpoint_subscriptions_group_event_type_uniq");
    expect(source).toContain("endpoint_subscriptions_fanout_event_type_uniq");
    expect(source).toContain("table.endpointId");
    expect(source).toContain("table.eventType");
  });

  it("does not use a regular index on (endpointId, eventType)", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    const lines = source.split("\n");
    const indexBlockStart = lines.findIndex((l) =>
      l.includes("(table) => ({"),
    );
    const indexBlockEnd = lines.findIndex(
      (l, i) => i > indexBlockStart && l.includes("})"),
    );
    const indexBlock = lines
      .slice(indexBlockStart, indexBlockEnd + 1)
      .join("\n");

    const regularIndexOnEndpointEventType =
      /index\([^)]*\)\s*\.on\(\s*table\.endpointId\s*,\s*table\.eventType\s*\)/.test(
        indexBlock,
      );
    expect(regularIndexOnEndpointEventType).toBe(false);
  });

  it("endpointSubscriptions is exported from schema index", async () => {
    const schema = await import("@/server/db/schema");
    expect(schema.endpointSubscriptions).toBeDefined();
  });

  it("endpointSubscriptions table defines endpointId and eventType columns", () => {
    expect(endpointSubscriptions.endpointId).toBeDefined();
    expect(endpointSubscriptions.eventType).toBeDefined();
  });

  it("uniqueIndex is defined AFTER all regular indexes in the table callback", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    const callbackStart = source.indexOf("(table) => ({");
    const callbackEnd = source.indexOf("});", callbackStart);
    const callback = source.slice(callbackStart, callbackEnd);
    const regularIdxPos = callback.indexOf("index(");
    const uniqueIdxPos = callback.indexOf("uniqueIndex(");
    expect(uniqueIdxPos).toBeGreaterThan(regularIdxPos);
  });

  it("partial unique index names follow convention endpoint_subscriptions_{mode}_event_type_uniq", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toMatch(/uniqueIndex\([\s\S]*?endpoint_subscriptions_direct_event_type_uniq[\s\S]*?\)/);
    expect(source).toMatch(/uniqueIndex\([\s\S]*?endpoint_subscriptions_group_event_type_uniq[\s\S]*?\)/);
    expect(source).toMatch(/uniqueIndex\([\s\S]*?endpoint_subscriptions_fanout_event_type_uniq[\s\S]*?\)/);
  });

  it("direct partial uniqueIndex covers endpointId + eventType, group covers endpointGroupId + eventType, fanout covers userId + eventType", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toMatch(
      /directEventTypeUnique[\s\S]*?\.on\([\s\S]*?table\.endpointId[\s\S]*?table\.eventType/s,
    );
    expect(source).toMatch(
      /groupEventTypeUnique[\s\S]*?\.on\([\s\S]*?table\.endpointGroupId[\s\S]*?table\.eventType/s,
    );
    expect(source).toMatch(
      /fanoutEventTypeUnique[\s\S]*?\.on\([\s\S]*?table\.userId[\s\S]*?table\.eventType/s,
    );
  });
});

describe("endpointSubscriptions schema — column definitions", () => {
  it("has id as uuid primary key with defaultRandom", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain('uuid("id").primaryKey().defaultRandom()');
  });

  it("endpointId references endpoints.id with cascade delete and is intentionally nullable", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    const endpointIdLine = source
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    expect(endpointIdLine).toBeDefined();
    expect(endpointIdLine!).toContain('references(() => endpoints.id, { onDelete: "cascade" })');
    expect(endpointIdLine!).not.toContain(".notNull()");
  });

  it("userId references users.id with cascade delete", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain('references(() => users.id, { onDelete: "cascade" })');
  });

  it("eventType is text and notNull", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain('text("event_type").notNull()');
  });

  it("isActive defaults to true and is notNull", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain('boolean("is_active").default(true).notNull()');
  });

  it("has createdAt and updatedAt timestamps with timezone", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain('timestamp("created_at", { withTimezone: true })');
    expect(source).toContain('timestamp("updated_at", { withTimezone: true })');
  });
});

describe("endpointSubscriptions schema — additional indexes", () => {
  it("has a user+eventType composite index", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain("endpoint_subscriptions_user_event_type_idx");
    expect(source).toMatch(/\.on\([\s\S]*?table\.userId[\s\S]*?table\.eventType[\s\S]*?\)/);
  });

  it("has an endpoint_id index", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain("endpoint_subscriptions_endpoint_id_idx");
  });

  it("has a partial index on active+user where isActive=true", () => {
    const source = readFileSync(
      "src/server/db/schema/endpoint-subscriptions.ts",
      "utf-8",
    );
    expect(source).toContain("endpoint_subscriptions_active_user_idx");
    expect(source).toContain(".where(sql`${table.isActive} = true`)");
  });
});

describe("endpointSubscriptions schema — relations", () => {
  it("defines endpointSubscriptionsRelations with endpoint and user relations", async () => {
    const schema = await import("@/server/db/schema");
    expect(schema.endpointSubscriptionsRelations).toBeDefined();
  });

  it("relation references endpoint via endpointId field", async () => {
    const source = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(source).toContain("endpointSubscriptionsRelations");
    expect(source).toContain("endpointSubscriptions.endpointId");
    expect(source).toContain("endpoints.id");
  });

  it("relation references user via userId field", async () => {
    const source = readFileSync(
      "src/server/db/schema/relations.ts",
      "utf-8",
    );
    expect(source).toContain("endpointSubscriptions.userId");
    expect(source).toContain("users.id");
  });
});

describe("endpointSubscriptions — type exports", () => {
  it("schema source declares EndpointSubscription type alias", () => {
    const source = readFileSync(
      "src/server/db/schema/index.ts",
      "utf-8",
    );
    expect(source).toContain("EndpointSubscription");
    expect(source).toContain("NewEndpointSubscription");
  });
});
