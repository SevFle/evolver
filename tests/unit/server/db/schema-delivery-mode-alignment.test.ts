import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { endpointSubscriptions } from "@/server/db/schema/endpoint-subscriptions";
import { events } from "@/server/db/schema/events";

const subsSource = readFileSync(
  "src/server/db/schema/endpoint-subscriptions.ts",
  "utf-8",
);
const eventsSource = readFileSync("src/server/db/schema/events.ts", "utf-8");

describe("endpointSubscriptions — endpointId is intentionally nullable", () => {
  it("endpointId column exists", () => {
    expect(endpointSubscriptions.endpointId).toBeDefined();
  });

  it("endpointId does NOT have .notNull() in source", () => {
    const endpointIdLine = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    expect(endpointIdLine).toBeDefined();
    expect(endpointIdLine!).not.toContain(".notNull()");
  });

  it("endpointId references endpoints.id with cascade", () => {
    expect(endpointIdLine()).toContain('references(() => endpoints.id, { onDelete: "cascade" })');
  });

  function endpointIdLine(): string {
    return subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")')) ?? "";
  }
});

describe("endpointSubscriptions — endpointGroupId is nullable", () => {
  it("endpointGroupId column exists", () => {
    expect(endpointSubscriptions.endpointGroupId).toBeDefined();
  });

  it("endpointGroupId does NOT have .notNull()", () => {
    const line = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_group_id")'));
    expect(line).toBeDefined();
    expect(line!).not.toContain(".notNull()");
  });

  it("endpointGroupId references endpointGroups.id with cascade", () => {
    expect(subsSource).toContain(
      'references(() => endpointGroups.id, { onDelete: "cascade" })',
    );
  });
});

describe("endpointSubscriptions — deliveryMode column", () => {
  it("deliveryMode column exists", () => {
    expect(endpointSubscriptions.deliveryMode).toBeDefined();
  });

  it("deliveryMode is text, notNull, defaults to 'direct'", () => {
    expect(subsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
  });

  it("deliveryMode has db column name 'delivery_mode'", () => {
    expect(subsSource).toContain('"delivery_mode"');
  });
});

describe("events — endpointId is intentionally nullable", () => {
  it("endpointId column exists", () => {
    expect(events.endpointId).toBeDefined();
  });

  it("endpointId does NOT have .notNull() in source", () => {
    const line = eventsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    expect(line).toBeDefined();
    expect(line!).not.toContain(".notNull()");
  });

  it("endpointId references endpoints.id with cascade", () => {
    expect(eventsSource).toContain(
      'references(() => endpoints.id, { onDelete: "cascade" })',
    );
  });
});

describe("events — endpointGroupId is nullable", () => {
  it("endpointGroupId column exists", () => {
    expect(events.endpointGroupId).toBeDefined();
  });

  it("endpointGroupId does NOT have .notNull()", () => {
    const lines = eventsSource.split("\n");
    const groupIdLines = lines.filter((l) =>
      l.includes('uuid("endpoint_group_id")'),
    );
    for (const line of groupIdLines) {
      if (line.includes("references")) {
        expect(line).not.toContain(".notNull()");
      }
    }
  });

  it("endpointGroupId references endpointGroups.id with set null", () => {
    expect(eventsSource).toContain(
      'references(() => endpointGroups.id, { onDelete: "set null" })',
    );
  });
});

describe("events — deliveryMode column", () => {
  it("deliveryMode column exists", () => {
    expect(events.deliveryMode).toBeDefined();
  });

  it("deliveryMode is text, notNull, defaults to 'direct'", () => {
    expect(eventsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
  });
});

describe("events — migration 0003 documentation", () => {
  it("source file documents the events_delivery_mode_check constraint from migration 0003", () => {
    expect(eventsSource).toContain("events_delivery_mode_check");
    expect(eventsSource).toContain("0003");
  });

  it("documents the delivery_mode semantics: direct, group, fanout", () => {
    expect(eventsSource).toContain("'direct'");
    expect(eventsSource).toContain("'group'");
    expect(eventsSource).toContain("'fanout'");
  });

  it("documents that the old events_target_check was replaced", () => {
    expect(eventsSource).toContain("events_target_check");
    expect(eventsSource).toContain("replaced");
  });
});

describe("schema alignment — both tables define deliveryMode identically", () => {
  it("both use text type for delivery_mode", () => {
    expect(subsSource).toContain('text("delivery_mode")');
    expect(eventsSource).toContain('text("delivery_mode")');
  });

  it("both have NOT NULL on delivery_mode", () => {
    expect(subsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
    expect(eventsSource).toContain(
      'text("delivery_mode").notNull().default("direct")',
    );
  });

  it("both default to 'direct'", () => {
    const subsDefault = subsSource.match(/delivery_mode.*default\("([^"]+)"\)/);
    const eventsDefault = eventsSource.match(
      /delivery_mode.*default\("([^"]+)"\)/,
    );
    expect(subsDefault?.[1]).toBe("direct");
    expect(eventsDefault?.[1]).toBe("direct");
  });
});

describe("schema alignment — CHECK constraints are SQL-only (Drizzle limitation)", () => {
  it("endpoint-subscriptions.ts does not define CHECK in Drizzle schema", () => {
    expect(subsSource).not.toContain("check(");
    expect(subsSource).not.toContain(".check(");
  });

  it("events.ts does not define CHECK in Drizzle schema", () => {
    expect(eventsSource).not.toContain("check(");
    expect(eventsSource).not.toContain(".check(");
  });

  it("the CHECK constraints exist in migration 0003 SQL", () => {
    const migration = readFileSync(
      "drizzle/0003_calm_crimson_falcon.sql",
      "utf-8",
    );
    expect(migration).toContain("endpoint_subscriptions_delivery_mode_check");
    expect(migration).toContain("events_delivery_mode_check");
  });
});

describe("relations — endpointSubscriptionsRelations", () => {
  it("defines relation to endpoints via endpointId", async () => {
    const { endpointSubscriptionsRelations } = await import(
      "@/server/db/schema/relations"
    );
    expect(endpointSubscriptionsRelations).toBeDefined();
  });

  it("defines relation to users via userId", async () => {
    const relSource = readFileSync("src/server/db/schema/relations.ts", "utf-8");
    expect(relSource).toContain("endpointSubscriptionsRelations");
    expect(relSource).toContain("endpointSubscriptions.userId");
  });

  it("defines relation to endpoint via endpointId", async () => {
    const relSource = readFileSync("src/server/db/schema/relations.ts", "utf-8");
    expect(relSource).toContain("endpointSubscriptions.endpointId");
  });
});

describe("type exports — EndpointSubscription includes deliveryMode", () => {
  it("EndpointSubscription type is exported from schema index", async () => {
    const indexSource = readFileSync("src/server/db/schema/index.ts", "utf-8");
    expect(indexSource).toContain("export type EndpointSubscription");
  });

  it("NewEndpointSubscription type is exported from schema index", async () => {
    const indexSource = readFileSync("src/server/db/schema/index.ts", "utf-8");
    expect(indexSource).toContain("export type NewEndpointSubscription");
  });

  it("WebhookEvent type is exported from schema index", async () => {
    const indexSource = readFileSync("src/server/db/schema/index.ts", "utf-8");
    expect(indexSource).toContain("export type WebhookEvent");
  });

  it("NewWebhookEvent type is exported from schema index", async () => {
    const indexSource = readFileSync("src/server/db/schema/index.ts", "utf-8");
    expect(indexSource).toContain("export type NewWebhookEvent");
  });
});

describe("nullable FK alignment between endpointSubscriptions and events", () => {
  it("both tables have nullable endpointId for fanout support", () => {
    const subsEndpointLine = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));
    const eventsEndpointLine = eventsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_id")'));

    expect(subsEndpointLine).toBeDefined();
    expect(eventsEndpointLine).toBeDefined();
    expect(subsEndpointLine!).not.toContain(".notNull()");
    expect(eventsEndpointLine!).not.toContain(".notNull()");
  });

  it("both tables have nullable endpointGroupId for direct/fanout support", () => {
    const subsGroupLine = subsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_group_id")'));
    const eventsGroupLine = eventsSource
      .split("\n")
      .find((l) => l.includes('uuid("endpoint_group_id")'));

    expect(subsGroupLine).toBeDefined();
    expect(eventsGroupLine).toBeDefined();
    expect(subsGroupLine!).not.toContain(".notNull()");
    expect(eventsGroupLine!).not.toContain(".notNull()");
  });
});
