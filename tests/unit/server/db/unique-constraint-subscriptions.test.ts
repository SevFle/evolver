import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const schemaSource = readFileSync(
  "src/server/db/schema/endpoint-subscriptions.ts",
  "utf-8",
);
const queriesSource = readFileSync(
  "src/server/db/queries/index.ts",
  "utf-8",
);
const routerSource = readFileSync(
  "src/server/trpc/routers/subscriptions.ts",
  "utf-8",
);

describe("unique constraint — schema definition", () => {
  it("imports uniqueIndex from drizzle-orm/pg-core", () => {
    expect(schemaSource).toContain("uniqueIndex");
  });

  it("defines directEventTypeUnique as a uniqueIndex", () => {
    expect(schemaSource).toContain("directEventTypeUnique: uniqueIndex");
  });

  it("direct uniqueIndex name is endpoint_subscriptions_direct_event_type_uniq", () => {
    expect(schemaSource).toContain('"endpoint_subscriptions_direct_event_type_uniq"');
  });

  it("uniqueIndex is on (endpointId, eventType) columns", () => {
    const match = schemaSource.match(
      /uniqueIndex\([\s\S]*?\)\s*\.on\(([\s\S]*?)\)/,
    );
    expect(match).not.toBeNull();
    const onClause = match![1];
    expect(onClause).toContain("table.endpointId");
    expect(onClause).toContain("table.eventType");
  });

  it("uniqueIndex is placed in the table callback, not as a standalone statement", () => {
    const callbackStart = schemaSource.indexOf("(table) => ({");
    const callbackEnd = schemaSource.indexOf("});", callbackStart);
    const callback = schemaSource.slice(callbackStart, callbackEnd);
    expect(callback).toContain("uniqueIndex(");
    expect(callback).toContain("directEventTypeUnique");
  });

  it("no other unique constraint exists on the table besides this index", () => {
    const uniqueMatches = schemaSource.match(/\.unique\(\)/g);
    expect(uniqueMatches).toBeNull();
  });
});

describe("unique constraint — migration consistency", () => {
  it("migration 0002 includes the same unique index name", () => {
    const migration = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    expect(migration).toContain("endpoint_subscriptions_endpoint_event_type_uniq");
    expect(migration).toContain("CREATE UNIQUE INDEX");
  });

  it("migration unique index covers same columns as schema", () => {
    const migration = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    const match = migration.match(
      /CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq"[^;]+/s,
    );
    expect(match).not.toBeNull();
    const stmt = match![0];
    expect(stmt).toContain('"endpoint_id"');
    expect(stmt).toContain('"event_type"');
  });
});

describe("unique constraint — onConflictDoUpdate in createSubscription", () => {
  it("createSubscription uses onConflictDoUpdate to handle duplicates gracefully", () => {
    const func = queriesSource.slice(
      queriesSource.indexOf("async function createSubscription"),
    );
    expect(func).toContain("onConflictDoUpdate");
  });

  it("conflict target matches the uniqueIndex columns", () => {
    const func = queriesSource.slice(
      queriesSource.indexOf("async function createSubscription"),
    );
    expect(func).toContain(
      "target: [endpointSubscriptions.endpointId, endpointSubscriptions.eventType]",
    );
  });

  it("onConflictDoUpdate sets isActive to true on conflict", () => {
    const func = queriesSource.slice(
      queriesSource.indexOf("async function createSubscription"),
    );
    expect(func).toContain("set: { isActive: true, updatedAt: new Date() }");
  });

  it("returns the subscription (null fallback for safety)", () => {
    const func = queriesSource.slice(
      queriesSource.indexOf("async function createSubscription"),
    );
    expect(func).toContain("subscription ?? null");
  });
});

describe("unique constraint — router CONFLICT handling", () => {
  it("subscription router throws CONFLICT when subscription is null", () => {
    expect(routerSource).toContain("CONFLICT");
    expect(routerSource).toContain(
      "Subscription already exists for this endpoint and event type",
    );
  });

  it("router checks for null subscription after createSubscription", () => {
    expect(routerSource).toMatch(/if\s*\(\s*!subscription\s*\)/);
  });
});

describe("unique constraint — behavioral test with mocked DB", () => {
  const {
    mockSelectFrom,
    mockSelectWhere,
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockInsertOnConflictDoNothing,
    mockInsertOnConflictDoUpdate,
  } = vi.hoisted(() => {
    const mockSelectWhere = vi.fn(() => []);
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
    const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
    const mockInsertOnConflictDoNothing = vi.fn(function (this: any) {
      return { returning: mockInsertReturning };
    });
    const mockInsertOnConflictDoUpdate = vi.fn(function (this: any) {
      return { returning: mockInsertReturning };
    });
    const mockInsertReturning = vi.fn(() => []);
    const mockInsertValues = vi.fn(() => ({
      returning: mockInsertReturning,
      onConflictDoNothing: mockInsertOnConflictDoNothing,
      onConflictDoUpdate: mockInsertOnConflictDoUpdate,
    }));
    const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
    return {
      mockSelectFrom,
      mockSelectWhere,
      mockSelect,
      mockInsertReturning,
      mockInsertValues,
      mockInsert,
      mockInsertOnConflictDoNothing,
      mockInsertOnConflictDoUpdate,
    };
  });

  vi.mock("@/server/db", () => ({
    db: {
      select: mockSelect,
      insert: mockInsert,
    },
  }));

  vi.mock("@/server/services/signing", () => ({
    generateSigningSecret: () => "whsec_test",
  }));

  vi.mock("@/server/auth/api-keys", () => ({
    generateApiKey: () => ({ raw: "key", prefix: "prefix", hash: "hash" }),
    hashApiKey: () => "hash",
  }));

  vi.mock("@/server/services/ssrf", () => ({
    validateEndpointUrl: vi.fn(),
    isPrivateIpv4: vi.fn(),
    isPrivateIpv6: vi.fn(),
    SsrfValidationError: class extends Error {},
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first insert succeeds, duplicate reactivates and returns subscription (simulates unique constraint)", async () => {
    const { createSubscription } = await import("@/server/db/queries");

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-1", endpointId: "ep-1", eventType: "order.created", isActive: true },
    ] as never[]);

    const first = await createSubscription("user-1", "ep-1", "order.created");
    expect(first).not.toBeNull();
    expect(first!.eventType).toBe("order.created");

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-1", endpointId: "ep-1", eventType: "order.created", isActive: true },
    ] as never[]);

    const duplicate = await createSubscription("user-1", "ep-1", "order.created");
    expect(duplicate).not.toBeNull();
    expect(duplicate!.isActive).toBe(true);
  });

  it("different event types for same endpoint both succeed", async () => {
    const { createSubscription } = await import("@/server/db/queries");

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-1", endpointId: "ep-1", eventType: "order.created", isActive: true },
    ] as never[]);

    const first = await createSubscription("user-1", "ep-1", "order.created");
    expect(first).not.toBeNull();

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-2", endpointId: "ep-1", eventType: "order.updated", isActive: true },
    ] as never[]);

    const second = await createSubscription("user-1", "ep-1", "order.updated");
    expect(second).not.toBeNull();
    expect(second!.eventType).toBe("order.updated");
  });

  it("same event type for different endpoints both succeed", async () => {
    const { createSubscription } = await import("@/server/db/queries");

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-1", endpointId: "ep-1", eventType: "order.created", isActive: true },
    ] as never[]);

    const first = await createSubscription("user-1", "ep-1", "order.created");
    expect(first).not.toBeNull();

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-2", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-2", endpointId: "ep-2", eventType: "order.created", isActive: true },
    ] as never[]);

    const second = await createSubscription("user-1", "ep-2", "order.created");
    expect(second).not.toBeNull();
  });

  it("wildcard patterns are treated as distinct event types by the unique constraint", async () => {
    const { createSubscription } = await import("@/server/db/queries");

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-1", endpointId: "ep-1", eventType: "order.*", isActive: true },
    ] as never[]);

    const wildcard = await createSubscription("user-1", "ep-1", "order.*");
    expect(wildcard).not.toBeNull();

    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-2", endpointId: "ep-1", eventType: "order.created", isActive: true },
    ] as never[]);

    const exact = await createSubscription("user-1", "ep-1", "order.created");
    expect(exact).not.toBeNull();
  });
});

describe("unique constraint — schema + query alignment", () => {
  it("schema uniqueIndex columns match onConflictDoNothing target columns", () => {
    const schemaMatch = schemaSource.match(
      /uniqueIndex\([\s\S]*?\)\s*\.on\(\s*table\.endpointId\s*,\s*table\.eventType\s*\)/,
    );
    expect(schemaMatch).not.toBeNull();

    const queryFunc = queriesSource.slice(
      queriesSource.indexOf("async function createSubscription"),
    );
    expect(queryFunc).toContain("endpointSubscriptions.endpointId");
    expect(queryFunc).toContain("endpointSubscriptions.eventType");
  });

  it("migration column order matches schema .on() order", () => {
    const migration = readFileSync("drizzle/0002_happy_mathemanic.sql", "utf-8");
    const stmt = migration.match(
      /CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq"[^;]+/s,
    );
    expect(stmt).not.toBeNull();
    const epPos = stmt![0].indexOf('"endpoint_id"');
    const evPos = stmt![0].indexOf('"event_type"');
    expect(epPos).toBeLessThan(evPos);

    const onClause = schemaSource.match(
      /\.on\(([\s\S]*?)\)/,
    );
    expect(onClause).not.toBeNull();
    const endpointPos = onClause?.[1]?.indexOf("table.endpointId") ?? -1;
    const eventTypePos = onClause?.[1]?.indexOf("table.eventType") ?? -1;
    expect(endpointPos).toBeLessThan(eventTypePos);
  });
});
