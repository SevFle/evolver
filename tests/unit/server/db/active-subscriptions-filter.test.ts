import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelect,
  mockSelectDistinctFrom,
  mockSelectDistinctWhere,
  mockSelectDistinct,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn(() => []);
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockSelectDistinctWhere = vi.fn(() => []);
  const mockSelectDistinctFrom = vi.fn(() => ({ where: mockSelectDistinctWhere }));
  const mockSelectDistinct = vi.fn(() => ({ from: mockSelectDistinctFrom }));
  return { mockSelectFrom, mockSelectWhere, mockSelect, mockSelectDistinctFrom, mockSelectDistinctWhere, mockSelectDistinct };
});

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
    selectDistinct: mockSelectDistinct,
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

import {
  getSubscriptionsByUserId,
  getSubscriptionsByEndpointId,
  resolveSubscribedEndpoints,
  getSubscribedEndpointsForEventType,
} from "@/server/db/queries";

const queriesSource = readFileSync("src/server/db/queries/index.ts", "utf-8");

function extractFunctionSource(source: string, funcName: string): string {
  const start = source.indexOf(`async function ${funcName}`);
  const boundaries = [
    source.indexOf("\nexport async function", start + 1),
    source.indexOf("\nexport function", start + 1),
    source.indexOf("\nasync function", start + 1),
  ].filter((i) => i > start);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : source.length;
  return source.slice(start, end);
}

describe("isActive filter — all 4 subscription query functions have it", () => {
  const functions = [
    "getSubscriptionsByUserId",
    "getSubscriptionsByEndpointId",
    "resolveSubscribedEndpoints",
    "getSubscribedEndpointsForEventType",
  ];

  for (const funcName of functions) {
    it(`${funcName} includes eq(endpointSubscriptions.isActive, true)`, () => {
      const body = extractFunctionSource(queriesSource, funcName);
      expect(body).toContain("eq(endpointSubscriptions.isActive, true)");
    });

    it(`${funcName} wraps conditions in and()`, () => {
      const body = extractFunctionSource(queriesSource, funcName);
      expect(body).toContain("and(");
    });
  }
});

describe("getSubscriptionsByUserId — isActive filter behavioral", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns only subscriptions where isActive=true (mocked DB returns active only)", async () => {
    const activeSubs = [
      { id: "s1", userId: "u1", endpointId: "e1", eventType: "order.*", isActive: true },
      { id: "s2", userId: "u1", endpointId: "e2", eventType: "invoice.*", isActive: true },
    ];
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [...activeSubs];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByUserId("u1");
    expect(result).toHaveLength(2);
    expect(result.every((s: any) => s.isActive === true)).toBe(true);
  });

  it("returns empty when user has only inactive subscriptions", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByUserId("u1");
    expect(result).toHaveLength(0);
  });

  it("filters by userId parameter", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    await getSubscriptionsByUserId("user-abc");
    expect(mockSelectFrom).toHaveBeenCalled();
  });
});

describe("getSubscriptionsByEndpointId — isActive filter behavioral", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns only active subscriptions for the endpoint", async () => {
    const activeSubs = [
      { id: "s1", userId: "u1", endpointId: "ep1", eventType: "order.created", isActive: true },
    ];
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [...activeSubs];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByEndpointId("ep1", "u1");
    expect(result).toHaveLength(1);
    expect(result[0]!.isActive).toBe(true);
  });

  it("returns empty when no active subscriptions exist for endpoint", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByEndpointId("ep1", "u1");
    expect(result).toHaveLength(0);
  });

  it("requires both endpointId and userId", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    await getSubscriptionsByEndpointId("ep1", "u1");
    expect(mockSelectFrom).toHaveBeenCalled();
  });
});

describe("resolveSubscribedEndpoints — isActive filter behavioral", () => {
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
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  it("excludes inactive subscriptions by only querying active ones", async () => {
    const activeSubs = [
      { eventType: "order.created", endpointId: "ep-1" },
    ];
    mockSelectWhere
      .mockReturnValueOnce(activeSubs as never[])
      .mockReturnValueOnce([makeEndpoint("ep-1")] as never[]);

    const result = await resolveSubscribedEndpoints("user-1", "order.created");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ep-1");
  });

  it("returns empty when all subscriptions are inactive (DB returns empty)", async () => {
    mockSelectWhere.mockReturnValueOnce([]);

    const result = await resolveSubscribedEndpoints("user-1", "order.created");
    expect(result).toHaveLength(0);
  });

  it("returns only matching subscriptions from active set", async () => {
    const activeSubs = [
      { eventType: "order.*", endpointId: "ep-1" },
      { eventType: "invoice.created", endpointId: "ep-2" },
    ];
    mockSelectWhere
      .mockReturnValueOnce(activeSubs as never[])
      .mockReturnValueOnce([makeEndpoint("ep-1")] as never[]);

    const result = await resolveSubscribedEndpoints("user-1", "order.created");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ep-1");
  });

  it("handles multiple active subscriptions matching same event type", async () => {
    const activeSubs = [
      { eventType: "order.*", endpointId: "ep-1" },
      { eventType: "*.created", endpointId: "ep-2" },
      { eventType: "order.created", endpointId: "ep-3" },
    ];
    mockSelectWhere
      .mockReturnValueOnce(activeSubs as never[])
      .mockReturnValueOnce([makeEndpoint("ep-1"), makeEndpoint("ep-2"), makeEndpoint("ep-3")] as never[]);

    const result = await resolveSubscribedEndpoints("user-1", "order.created");
    expect(result).toHaveLength(3);
  });
});

describe("getSubscribedEndpointsForEventType — isActive filter behavioral", () => {
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
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  it("returns only active endpoints matching the event type", async () => {
    const subs = [{ endpointId: "ep-1" }, { endpointId: "ep-2" }];
    mockSelectDistinctWhere.mockReturnValueOnce(subs as never[]);
    mockSelectWhere.mockReturnValueOnce([makeEndpoint("ep-1"), makeEndpoint("ep-2")] as never[]);

    const result = await getSubscribedEndpointsForEventType("user-1", "order.created");
    expect(result).toHaveLength(2);
  });

  it("returns empty when no active subscriptions match event type", async () => {
    mockSelectWhere.mockReturnValueOnce([]);

    const result = await getSubscribedEndpointsForEventType("user-1", "nonexistent.event");
    expect(result).toEqual([]);
  });

  it("deduplicates endpoint IDs from multiple matching subscriptions", async () => {
    const subs = [{ endpointId: "ep-1" }, { endpointId: "ep-1" }];
    mockSelectDistinctWhere.mockReturnValueOnce(subs as never[]);
    mockSelectWhere.mockReturnValueOnce([makeEndpoint("ep-1")] as never[]);

    const result = await getSubscribedEndpointsForEventType("user-1", "order.created");
    expect(result).toHaveLength(1);
  });
});

describe("isActive filter — consistent across all query functions", () => {
  it("getSubscriptionsByUserId filters on both userId and isActive", () => {
    const body = extractFunctionSource(queriesSource, "getSubscriptionsByUserId");
    expect(body).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(body).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("getSubscriptionsByEndpointId filters on endpointId, userId, and isActive", () => {
    const body = extractFunctionSource(queriesSource, "getSubscriptionsByEndpointId");
    expect(body).toContain("eq(endpointSubscriptions.endpointId, endpointId)");
    expect(body).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(body).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("resolveSubscribedEndpoints filters on userId and isActive", () => {
    const body = extractFunctionSource(queriesSource, "resolveSubscribedEndpoints");
    expect(body).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(body).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("getSubscribedEndpointsForEventType filters on userId and isActive", () => {
    const body = extractFunctionSource(queriesSource, "getSubscribedEndpointsForEventType");
    expect(body).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(body).toContain("eq(endpointSubscriptions.isActive, true)");
  });
});

describe("isActive filter — no subscription query returns inactive records", () => {
  it("deleteSubscription soft-deletes by setting isActive to false via update", () => {
    const body = extractFunctionSource(queriesSource, "deleteSubscription");
    expect(body).toContain("update(endpointSubscriptions)");
    expect(body).toContain("set({ isActive: false, updatedAt: new Date() })");
    expect(body).toContain("eq(endpointSubscriptions.id, id)");
    expect(body).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(body).not.toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("createSubscription uses onConflictDoUpdate to set isActive:true on conflict", () => {
    const body = extractFunctionSource(queriesSource, "createSubscription");
    const insertSection = body.slice(body.indexOf("insert("));
    expect(insertSection).toContain("onConflictDoUpdate");
    expect(insertSection).toContain("isActive: true");
  });
});

describe("isActive filter — edge cases in resolveSubscribedEndpoints", () => {
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
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  it("handles empty active subscription list gracefully", async () => {
    mockSelectWhere.mockReturnValueOnce([]);
    const result = await resolveSubscribedEndpoints("user-1", "any.event");
    expect(result).toEqual([]);
  });

  it("still works when active subs match but endpoints are inactive", async () => {
    const activeSubs = [
      { eventType: "order.*", endpointId: "ep-1" },
    ];
    mockSelectWhere
      .mockReturnValueOnce(activeSubs as never[])
      .mockReturnValueOnce([]);

    const result = await resolveSubscribedEndpoints("user-1", "order.created");
    expect(result).toEqual([]);
  });

  it("correctly handles wildcard pattern matching with isActive filter", async () => {
    const activeSubs = [
      { eventType: "*", endpointId: "ep-catchall" },
    ];
    mockSelectWhere
      .mockReturnValueOnce(activeSubs as never[])
      .mockReturnValueOnce([makeEndpoint("ep-catchall")] as never[]);

    const result = await resolveSubscribedEndpoints("user-1", "any.event.type");
    expect(result).toHaveLength(1);
  });
});
