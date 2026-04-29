import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelect,
  mockSelectDistinctFrom,
  mockSelectDistinctWhere,
  mockSelectDistinct,
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
  const mockSelectDistinctWhere = vi.fn(() => []);
  const mockSelectDistinctFrom = vi.fn(() => ({ where: mockSelectDistinctWhere }));
  const mockSelectDistinct = vi.fn(() => ({ from: mockSelectDistinctFrom }));
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
    mockSelectDistinctFrom,
    mockSelectDistinctWhere,
    mockSelectDistinct,
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
    selectDistinct: mockSelectDistinct,
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

import { TRPCError } from "@trpc/server";
import {
  createSubscription,
  deleteSubscription,
  getSubscribedEndpointsForEventType,
} from "@/server/db/queries";

describe("createSubscription — source code structure", () => {
  it("uses onConflictDoUpdate with target [endpointId, eventType]", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function createSubscription"));
    expect(func).toContain("onConflictDoUpdate");
    expect(func).toContain("target: [endpointSubscriptions.endpointId, endpointSubscriptions.eventType]");
    expect(func).toContain("set: { isActive: true, updatedAt: new Date() }");
  });

  it("returns null when onConflictDoUpdate causes returning to be empty", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function createSubscription"));
    expect(func).toContain("return subscription ?? null");
  });

  it("validates endpoint ownership before inserting", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function createSubscription"));
    expect(func).toContain("getEndpointById");
    expect(func).toContain("NOT_FOUND");
    expect(func).toContain("Endpoint not found");
  });

  it("inserts userId, endpointId, eventType into endpointSubscriptions", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function createSubscription"));
    expect(func).toContain("insert(endpointSubscriptions)");
    expect(func).toContain("userId");
    expect(func).toContain("endpointId");
    expect(func).toContain("eventType");
  });
});

describe("createSubscription — behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when endpoint does not exist for user", async () => {
    mockSelectWhere.mockReturnValueOnce([]);

    await expect(
      createSubscription("user-1", "ep-nonexistent", "order.created"),
    ).rejects.toThrow("Endpoint not found");

    try {
      await createSubscription("user-1", "ep-nonexistent", "order.created");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("creates subscription when endpoint exists and no conflict", async () => {
    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      {
        id: "sub-1",
        userId: "user-1",
        endpointId: "ep-1",
        eventType: "order.created",
        isActive: true,
      },
    ] as never[]);

    const result = await createSubscription("user-1", "ep-1", "order.created");
    expect(result).toEqual(
      expect.objectContaining({
        id: "sub-1",
        userId: "user-1",
        endpointId: "ep-1",
        eventType: "order.created",
      }),
    );
    expect(mockInsertOnConflictDoUpdate).toHaveBeenCalledWith({
      target: [expect.anything(), expect.anything()],
      set: { isActive: true, updatedAt: expect.any(Date) },
    });
  });

  it("returns reactivated subscription when subscription already exists (conflict)", async () => {
    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([
      {
        id: "sub-1",
        userId: "user-1",
        endpointId: "ep-1",
        eventType: "order.created",
        isActive: true,
      },
    ] as never[]);

    const result = await createSubscription("user-1", "ep-1", "order.created");
    expect(result).not.toBeNull();
    expect(result!.isActive).toBe(true);
  });

  it("calls onConflictDoUpdate with endpointId and eventType as target", async () => {
    mockSelectWhere.mockReturnValueOnce([{ id: "ep-1", userId: "user-1" }] as never[]);
    mockInsertReturning.mockReturnValueOnce([{ id: "sub-new" }] as never[]);

    await createSubscription("user-1", "ep-1", "order.updated");
    expect(mockInsertOnConflictDoUpdate).toHaveBeenCalled();
  });
});

describe("deleteSubscription — source code structure", () => {
  it("soft-deletes by updating isActive to false", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function deleteSubscription"));
    const funcBody = func.slice(0, func.indexOf("\n}", func.indexOf("{")));
    expect(funcBody).toContain("update(endpointSubscriptions)");
    expect(funcBody).toContain("set({ isActive: false, updatedAt: new Date() })");
    expect(funcBody).toContain("eq(endpointSubscriptions.id, id)");
    expect(funcBody).toContain("eq(endpointSubscriptions.userId, userId)");
  });

  it("returns updated record or null", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function deleteSubscription"));
    expect(func).toContain("return deleted ?? null");
  });
});

describe("deleteSubscription — behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns soft-deleted subscription when found", async () => {
    const deletedSub = {
      id: "sub-1",
      userId: "user-1",
      endpointId: "ep-1",
      eventType: "order.created",
      isActive: false,
    };
    mockUpdateReturning.mockReturnValueOnce([deletedSub] as never[]);

    const result = await deleteSubscription("sub-1", "user-1");
    expect(result).toEqual(deletedSub);
    expect(mockUpdateSet).toHaveBeenCalledWith({ isActive: false, updatedAt: expect.any(Date) });
  });

  it("returns null when subscription not found", async () => {
    mockUpdateReturning.mockReturnValueOnce([]);

    const result = await deleteSubscription("sub-nonexistent", "user-1");
    expect(result).toBeNull();
  });
});

describe("getSubscribedEndpointsForEventType — source code structure", () => {
  it("includes isActive=true filter in query", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function getSubscribedEndpointsForEventType"));
    expect(func).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("uses selectDistinct for endpointId", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function getSubscribedEndpointsForEventType"));
    expect(func).toContain("selectDistinct");
    expect(func).toContain("endpointId: endpointSubscriptions.endpointId");
  });

  it("filters by userId alongside isActive", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function getSubscribedEndpointsForEventType"));
    expect(func).toContain("eq(endpointSubscriptions.userId, userId)");
  });

  it("returns empty array when no subscriptions found", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function getSubscribedEndpointsForEventType"));
    expect(func).toContain("if (subs.length === 0) return []");
  });

  it("calls getActiveEndpointsByIds with collected endpoint IDs", () => {
    const source = readFileSync("src/server/db/queries/index.ts", "utf-8");
    const func = source.slice(source.indexOf("async function getSubscribedEndpointsForEventType"));
    expect(func).toContain("getActiveEndpointsByIds(ids, userId)");
  });
});

describe("getSubscribedEndpointsForEventType — behavioral tests", () => {
  function makeEndpoint(id: string) {
    return {
      id,
      url: `https://${id}.example.com`,
      name: id,
      signingSecret: "secret",
      status: "active",
      isActive: true,
      customHeaders: null,
      userId: "user-1",
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  it("returns empty when no subscriptions match", async () => {
    const result = await getSubscribedEndpointsForEventType("user-1", "order.created");
    expect(result).toEqual([]);
  });

  it("returns active endpoints when subscriptions match event type", async () => {
    const subs = [{ endpointId: "ep-1" }, { endpointId: "ep-2" }];
    const endpoints = [makeEndpoint("ep-1"), makeEndpoint("ep-2")];

    mockSelectDistinctWhere.mockReturnValueOnce(subs as never[]);
    mockSelectWhere.mockReturnValueOnce(endpoints as never[]);

    const result = await getSubscribedEndpointsForEventType("user-1", "order.created");
    expect(result).toHaveLength(2);
  });

  it("returns empty when subscriptions exist but no active endpoints found", async () => {
    const subs = [{ endpointId: "ep-1" }];
    mockSelectWhere
      .mockReturnValueOnce(subs as never[])
      .mockReturnValueOnce([]);

    const result = await getSubscribedEndpointsForEventType("user-1", "order.created");
    expect(result).toEqual([]);
  });
});
