import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelect,
  mockActiveEndpoints,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn<() => unknown[]>(() => []);
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockActiveEndpoints = vi.fn<(ids: string[]) => unknown[]>(() => []);
  return { mockSelectFrom, mockSelectWhere, mockSelect, mockActiveEndpoints };
});

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
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

import { resolveSubscribedEndpoints, getSubscriptionsByUserId, getSubscriptionsByEndpointId } from "@/server/db/queries";

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

describe("resolveSubscribedEndpoints — regex escaping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  async function setupAndResolve(
    subs: { eventType: string; endpointId: string }[],
    incomingEventType: string,
  ) {
    const uniqueEndpointIds = [...new Set(subs.map((s) => s.endpointId))];
    mockSelectWhere
      .mockReturnValueOnce(subs as never[])
      .mockReturnValueOnce(uniqueEndpointIds.map(makeEndpoint) as never[]);
    mockActiveEndpoints.mockImplementation((ids: string[]) =>
      ids.map(makeEndpoint),
    );

    const result = await resolveSubscribedEndpoints("user-1", incomingEventType);
    return result;
  }

  it("escapes dot in subscription pattern so it matches literally", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.created", endpointId: "ep-1" }],
      "orderXcreated",
    );
    expect(result).toHaveLength(0);
  });

  it("matches literal dot in subscription pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.created", endpointId: "ep-1" }],
      "order.created",
    );
    expect(result).toHaveLength(1);
  });

  it("escapes plus sign in subscription pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user+created", endpointId: "ep-1" }],
      "userXcreated",
    );
    expect(result).toHaveLength(0);
  });

  it("matches literal plus sign in subscription pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user+created", endpointId: "ep-1" }],
      "user+created",
    );
    expect(result).toHaveLength(1);
  });

  it("escapes parentheses in subscription pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user(created)", endpointId: "ep-1" }],
      "userXcreatedY",
    );
    expect(result).toHaveLength(0);
  });

  it("matches literal parentheses in subscription pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user(created)", endpointId: "ep-1" }],
      "user(created)",
    );
    expect(result).toHaveLength(1);
  });

  it("wildcard * still works after escaping metacharacters", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.*", endpointId: "ep-1" }],
      "order.created",
    );
    expect(result).toHaveLength(1);
  });

  it("wildcard * does not match when dot should be literal", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.*", endpointId: "ep-1" }],
      "orderXcreated",
    );
    expect(result).toHaveLength(0);
  });

  it("handles multiple metacharacters with wildcard", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user.+*", endpointId: "ep-1" }],
      "user.+extra",
    );
    expect(result).toHaveLength(1);
  });

  it("handles dollar sign in pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "us$er", endpointId: "ep-1" }],
      "us$er",
    );
    expect(result).toHaveLength(1);
  });

  it("does not match dollar sign pattern against different string", async () => {
    const result = await setupAndResolve(
      [{ eventType: "us$er", endpointId: "ep-1" }],
      "usXer",
    );
    expect(result).toHaveLength(0);
  });

  it("handles square brackets in pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user[0-9]", endpointId: "ep-1" }],
      "user[0-9]",
    );
    expect(result).toHaveLength(1);
  });

  it("does not match square brackets as regex character class", async () => {
    const result = await setupAndResolve(
      [{ eventType: "user[0-9]", endpointId: "ep-1" }],
      "user5",
    );
    expect(result).toHaveLength(0);
  });
});

describe("resolveSubscribedEndpoints — glob wildcard behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  async function setupAndResolve(
    subs: { eventType: string; endpointId: string }[],
    incomingEventType: string,
  ) {
    const uniqueEndpointIds = [...new Set(subs.map((s) => s.endpointId))];
    mockSelectWhere
      .mockReturnValueOnce(subs as never[])
      .mockReturnValueOnce(uniqueEndpointIds.map(makeEndpoint) as never[]);
    return resolveSubscribedEndpoints("user-1", incomingEventType);
  }

  it("matches exact eventType without wildcard", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.created", endpointId: "ep-1" }],
      "order.created",
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("ep-1");
  });

  it("does not match different eventType without wildcard", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.created", endpointId: "ep-1" }],
      "order.updated",
    );
    expect(result).toHaveLength(0);
  });

  it("matches prefix with trailing wildcard order.*", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.*", endpointId: "ep-1" }],
      "order.created",
    );
    expect(result).toHaveLength(1);
  });

  it("matches when wildcard is in middle of pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.*.shipped", endpointId: "ep-1" }],
      "order.us.shipped",
    );
    expect(result).toHaveLength(1);
  });

  it("does not match when middle wildcard segment mismatch", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.*.shipped", endpointId: "ep-1" }],
      "order.delivered",
    );
    expect(result).toHaveLength(0);
  });

  it("matches leading wildcard *.created", async () => {
    const result = await setupAndResolve(
      [{ eventType: "*.created", endpointId: "ep-1" }],
      "order.created",
    );
    expect(result).toHaveLength(1);
  });

  it("leading wildcard matches any prefix", async () => {
    const result = await setupAndResolve(
      [{ eventType: "*.created", endpointId: "ep-1" }],
      "invoice.created",
    );
    expect(result).toHaveLength(1);
  });

  it("double wildcard ** matches zero characters", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order**created", endpointId: "ep-1" }],
      "ordercreated",
    );
    expect(result).toHaveLength(1);
  });

  it("trailing wildcard * matches empty suffix", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order*", endpointId: "ep-1" }],
      "order",
    );
    expect(result).toHaveLength(1);
  });

  it("wildcard does not match across segment boundaries when not in pattern", async () => {
    const result = await setupAndResolve(
      [{ eventType: "order.created", endpointId: "ep-1" }],
      "orderXcreated",
    );
    expect(result).toHaveLength(0);
  });
});

describe("resolveSubscribedEndpoints — non-backtracking glob (ReDoS safety)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  async function setupAndResolve(
    subs: { eventType: string; endpointId: string }[],
    incomingEventType: string,
  ) {
    const uniqueEndpointIds = [...new Set(subs.map((s) => s.endpointId))];
    mockSelectWhere
      .mockReturnValueOnce(subs as never[])
      .mockReturnValueOnce(uniqueEndpointIds.map(makeEndpoint) as never[]);
    return resolveSubscribedEndpoints("user-1", incomingEventType);
  }

  it("completes within reasonable time for pathological pattern *a*a*a with long input", async () => {
    const pattern = "*a*a*a";
    const input = "a".repeat(100) + "b";
    const start = performance.now();
    const result = await setupAndResolve(
      [{ eventType: pattern, endpointId: "ep-1" }],
      input,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toHaveLength(0);
  });

  it("completes within reasonable time for pathological *a*b*a with long input", async () => {
    const pattern = "*a*b*a";
    const input = "a".repeat(50) + "b".repeat(50) + "c";
    const start = performance.now();
    const result = await setupAndResolve(
      [{ eventType: pattern, endpointId: "ep-1" }],
      input,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toHaveLength(0);
  });

  it("completes within reasonable time for consecutive wildcards ***a", async () => {
    const pattern = "***a";
    const input = "b".repeat(200);
    const start = performance.now();
    const result = await setupAndResolve(
      [{ eventType: pattern, endpointId: "ep-1" }],
      input,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toHaveLength(0);
  });

  it("completes within reasonable time for many wildcards", async () => {
    const pattern = "*.*.*.*.*.*.created";
    const input = "a.b.c.d.e.f.created";
    const start = performance.now();
    const result = await setupAndResolve(
      [{ eventType: pattern, endpointId: "ep-1" }],
      input,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toHaveLength(1);
  });

  it("handles pattern with many repeated segments without catastrophic backtracking", async () => {
    const pattern = "a.*.a.*.a.*.b";
    const input = "a.xa.xa.x".repeat(10) + "c";
    const start = performance.now();
    const result = await setupAndResolve(
      [{ eventType: pattern, endpointId: "ep-1" }],
      input,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("resolveSubscribedEndpoints — multiple subscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  async function setupAndResolve(
    subs: { eventType: string; endpointId: string }[],
    incomingEventType: string,
  ) {
    const uniqueEndpointIds = [...new Set(subs.map((s) => s.endpointId))];
    mockSelectWhere
      .mockReturnValueOnce(subs as never[])
      .mockReturnValueOnce(uniqueEndpointIds.map(makeEndpoint) as never[]);
    return resolveSubscribedEndpoints("user-1", incomingEventType);
  }

  it("deduplicates endpoint IDs from multiple matching subscriptions", async () => {
    const result = await setupAndResolve(
      [
        { eventType: "order.*", endpointId: "ep-1" },
        { eventType: "*.created", endpointId: "ep-1" },
      ],
      "order.created",
    );
    const ids = result.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("returns all matching endpoints from different subscriptions", async () => {
    const result = await setupAndResolve(
      [
        { eventType: "order.*", endpointId: "ep-1" },
        { eventType: "*.created", endpointId: "ep-2" },
      ],
      "order.created",
    );
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("ep-1");
    expect(ids).toContain("ep-2");
  });

  it("returns empty when no subscriptions match", async () => {
    const result = await setupAndResolve(
      [
        { eventType: "order.updated", endpointId: "ep-1" },
        { eventType: "invoice.*", endpointId: "ep-2" },
      ],
      "order.created",
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty when subscription list is empty", async () => {
    const result = await setupAndResolve([], "order.created");
    expect(result).toHaveLength(0);
  });
});

describe("resolveSubscribedEndpoints — uses globMatch from queries source", () => {
  it("queries/index.ts defines a local globMatch function", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    expect(source).toMatch(/function globMatch\(pattern:\s*string,\s*input:\s*string\)/);
  });

  it("globMatch is called by resolveSubscribedEndpoints, not SQL LIKE", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const resolveFunc = source.slice(
      source.indexOf("async function resolveSubscribedEndpoints"),
    );
    expect(resolveFunc).toContain("globMatch(");
  });

  it("resolveSubscribedEndpoints fetches all active subscriptions then filters in-code", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const resolveFunc = source.slice(
      source.indexOf("async function resolveSubscribedEndpoints"),
    );
    expect(resolveFunc).toContain("eq(endpointSubscriptions.isActive, true)");
    expect(resolveFunc).toContain("matchingEndpointIds");
  });
});

describe("getSubscriptionsByUserId — isActive filter", () => {
  it("includes eq(endpointSubscriptions.isActive, true) in WHERE clause", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const funcSource = source.slice(
      source.indexOf("async function getSubscriptionsByUserId"),
    );
    const closingBrace = funcSource.indexOf("\n}", funcSource.indexOf("{"));
    const funcBody = funcSource.slice(0, closingBrace);
    expect(funcBody).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("filters by userId alongside isActive", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const funcSource = source.slice(
      source.indexOf("async function getSubscriptionsByUserId"),
    );
    expect(funcSource).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(funcSource).toContain("eq(endpointSubscriptions.isActive, true)");
  });
});

describe("getSubscriptionsByEndpointId — isActive filter", () => {
  it("includes eq(endpointSubscriptions.isActive, true) in WHERE clause", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const funcSource = source.slice(
      source.indexOf("async function getSubscriptionsByEndpointId"),
    );
    const closingBrace = funcSource.indexOf("\n}", funcSource.indexOf("{"));
    const funcBody = funcSource.slice(0, closingBrace);
    expect(funcBody).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("filters by endpointId and userId alongside isActive", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const funcSource = source.slice(
      source.indexOf("async function getSubscriptionsByEndpointId"),
    );
    expect(funcSource).toContain("eq(endpointSubscriptions.endpointId, endpointId)");
    expect(funcSource).toContain("eq(endpointSubscriptions.userId, userId)");
    expect(funcSource).toContain("eq(endpointSubscriptions.isActive, true)");
  });
});

describe("getSubscriptionsByUserId — isActive behavioral filtering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns only active subscriptions from the database", async () => {
    const activeSubs = [
      { id: "sub-1", userId: "user-1", endpointId: "ep-1", eventType: "order.*", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [...activeSubs];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByUserId("user-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.isActive).toBe(true);
  });

  it("returns empty when all subscriptions are inactive", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByUserId("user-1");
    expect(result).toHaveLength(0);
  });
});

describe("getSubscriptionsByEndpointId — isActive behavioral filtering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns only active subscriptions for the specified endpoint", async () => {
    const activeSubs = [
      { id: "sub-2", userId: "user-1", endpointId: "ep-1", eventType: "order.created", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [...activeSubs];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByEndpointId("ep-1", "user-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.isActive).toBe(true);
    expect(result[0]!.endpointId).toBe("ep-1");
  });

  it("returns empty when no active subscriptions exist for endpoint", async () => {
    mockSelectWhere.mockImplementationOnce(() => {
      const arr: any = [];
      arr.orderBy = vi.fn(() => arr);
      return arr;
    });

    const result = await getSubscriptionsByEndpointId("ep-1", "user-1");
    expect(result).toHaveLength(0);
  });
});
