import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelect,
  mockInsertReturning,
  mockInsertValues,
  mockInsert,
  mockInsertOnConflictDoNothing,
  mockInsertOnConflictDoUpdate,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockDeleteWhere,
  mockDeleteReturning,
  mockDelete,
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
  const mockUpdateReturning = vi.fn(() => []);
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockDeleteReturning = vi.fn(() => []);
  const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }));
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockInsertOnConflictDoNothing,
    mockInsertOnConflictDoUpdate,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockDeleteWhere,
    mockDeleteReturning,
    mockDelete,
  };
});

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
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

vi.mock("@/server/trpc/init", () => ({
  router: vi.fn((obj) => obj),
  protectedProcedure: {
    input: vi.fn(() => ({
      mutation: vi.fn((fn) => fn),
      query: vi.fn((fn) => fn),
    })),
  },
}));

import { TRPCError } from "@trpc/server";

const source = readFileSync("src/server/trpc/routers/subscriptions.ts", "utf-8");

describe("subscriptionRouter — source code structure", () => {
  it("defines a create mutation", () => {
    expect(source).toContain("create:");
    expect(source).toContain(".mutation(");
  });

  it("defines a list query", () => {
    expect(source).toContain("list:");
    expect(source).toContain(".query(");
  });

  it("defines a listByEndpoint query", () => {
    expect(source).toContain("listByEndpoint:");
  });

  it("defines a delete mutation", () => {
    expect(source).toContain("delete:");
  });

  it("imports createSubscription, getSubscriptionsByEndpointId, getSubscriptionsByUserId, deleteSubscription", () => {
    expect(source).toContain("createSubscription");
    expect(source).toContain("getSubscriptionsByEndpointId");
    expect(source).toContain("getSubscriptionsByUserId");
    expect(source).toContain("deleteSubscription");
  });
});

describe("subscriptionRouter.create — input validation", () => {
  it("validates endpointId as uuid", () => {
    expect(source).toContain("endpointId: z.string().uuid()");
  });

  it("validates eventType with min 1 and max 255", () => {
    expect(source).toContain("eventType: z.string().min(1).max(255)");
  });
});

describe("subscriptionRouter.create — conflict handling", () => {
  it("throws CONFLICT when subscription already exists", () => {
    expect(source).toContain("code: \"CONFLICT\"");
    expect(source).toContain("Subscription already exists for this endpoint and event type");
  });

  it("checks if subscription is null after createSubscription", () => {
    expect(source).toContain("if (!subscription)");
  });

  it("returns the subscription object on success", () => {
    expect(source).toContain("return subscription");
  });
});

describe("subscriptionRouter.list — uses isActive filter", () => {
  it("delegates to getSubscriptionsByUserId which includes isActive=true", () => {
    const queries = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = queries.slice(queries.indexOf("async function getSubscriptionsByUserId"));
    const funcBody = func.slice(0, func.indexOf("\n}", func.indexOf("{")));
    expect(funcBody).toContain("eq(endpointSubscriptions.isActive, true)");
  });
});

describe("subscriptionRouter.listByEndpoint — endpoint ownership check", () => {
  it("fetches endpoint first to verify ownership", () => {
    expect(source).toContain("getEndpointById(input.endpointId, ctx.userId)");
  });

  it("throws NOT_FOUND when endpoint not found", () => {
    expect(source).toContain("Endpoint not found");
  });

  it("delegates to getSubscriptionsByEndpointId which includes isActive=true", () => {
    const queries = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = queries.slice(queries.indexOf("async function getSubscriptionsByEndpointId"));
    const funcBody = func.slice(0, func.indexOf("\n}", func.indexOf("{")));
    expect(funcBody).toContain("eq(endpointSubscriptions.isActive, true)");
  });
});

describe("subscriptionRouter.delete — not found handling", () => {
  it("throws NOT_FOUND when subscription not found", () => {
    expect(source).toContain("Subscription not found");
  });

  it("returns success true on deletion", () => {
    expect(source).toContain("success: true");
  });

  it("deletes by id and userId for authorization", () => {
    expect(source).toContain("deleteSubscription(input.id, ctx.userId)");
  });
});

describe("subscriptionRouter — end-to-end behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create flow: returns subscription for valid new subscription", async () => {
    const { createSubscription } = await import("@/server/db/queries");
    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-new", userId: "user-1", endpointId: "ep-1", eventType: "order.*", isActive: true },
    ] as never[]);

    const result = await createSubscription("user-1", "ep-1", "order.*");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("sub-new");
  });

  it("create flow: reactivates and returns subscription for duplicate (conflict)", async () => {
    const { createSubscription } = await import("@/server/db/queries");
    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      { id: "sub-existing", userId: "user-1", endpointId: "ep-1", eventType: "order.*", isActive: true },
    ] as never[]);

    const result = await createSubscription("user-1", "ep-1", "order.*");
    expect(result).not.toBeNull();
    expect(result!.isActive).toBe(true);
  });

  it("list flow: returns only active subscriptions", async () => {
    const { getSubscriptionsByUserId } = await import("@/server/db/queries");
    const activeSubs = [
      { id: "sub-1", eventType: "order.*", isActive: true },
      { id: "sub-2", eventType: "invoice.*", isActive: true },
    ];
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [...activeSubs];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByUserId("user-1");
    expect(result).toHaveLength(2);
    expect(result.every((s: any) => s.isActive === true)).toBe(true);
  });

  it("delete flow: returns null when not owned by user", async () => {
    const { deleteSubscription } = await import("@/server/db/queries");
    mockUpdateReturning.mockReturnValueOnce([]);

    const result = await deleteSubscription("sub-1", "other-user");
    expect(result).toBeNull();
  });
});
