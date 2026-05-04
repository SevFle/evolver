import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import {
  authBearerHeader,
  apiKeyHeader,
  DEFAULT_SECRET,
  authHeadersWithCsrf,
  createCsrfToken,
} from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const { mockDbState } = vi.hoisted(() => {
  let callIndex = 0;
  let results: any[][] = [[{ count: "0" }], []];
  return {
    mockDbState: {
      setResults(r: any[][]) {
        results = r;
        callIndex = 0;
      },
      reset() {
        results = [[{ count: "0" }], []];
        callIndex = 0;
      },
      getNext() {
        return results[callIndex++] || [];
      },
    },
  };
});

vi.mock("@shiplens/db", () => ({
  db: {
    select: vi.fn(() => {
      const value = mockDbState.getNext();
      const chain: any = {
        then(onFulfilled: any) {
          onFulfilled(value);
        },
        catch() {},
      };
      chain.from = chain.where = chain.orderBy = chain.limit = chain.offset =
        vi.fn().mockReturnValue(chain);
      return chain;
    }),
  },
  shipments: {
    id: "id",
    tenantId: "tenantId",
    trackingId: "trackingId",
    reference: "reference",
    origin: "origin",
    destination: "destination",
    carrier: "carrier",
    serviceType: "serviceType",
    status: "status",
    customerName: "customerName",
    customerEmail: "customerEmail",
    estimatedDelivery: "estimatedDelivery",
    actualDelivery: "actualDelivery",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  milestones: {
    id: "id",
    shipmentId: "shipmentId",
    type: "type",
    description: "description",
    location: "location",
    occurredAt: "occurredAt",
  },
  shipmentStatusEnum: {
    enumValues: [
      "pending",
      "booked",
      "in_transit",
      "at_port",
      "customs_clearance",
      "out_for_delivery",
      "delivered",
      "exception",
    ],
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  like: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  sql: vi.fn((strings: any, ...values: any[]) => ({})),
}));

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-test-key")) return "tenant-int";
  return null;
};

describe("Integration: Health Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/health returns 200 with status ok", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
  });

  it("GET /api/health returns valid ISO timestamp", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    const body = res.json();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("GET /api/health returns version string", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    const body = res.json();
    expect(typeof body.version).toBe("string");
  });

  it("GET /api/health does not require auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("Integration: Shipment Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/shipments/:trackingId returns tracking data", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments/TRK-12345",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.trackingId).toBe("TRK-12345");
  });

  it("GET /api/shipments/:trackingId with special characters", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments/TRK-abc-123",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.trackingId).toBe("TRK-abc-123");
  });

  it("POST /api/shipments returns 201 with CSRF token", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/shipments",
      payload: {},
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Shipment created");
  });

  it("rejects unauthenticated GET /api/shipments with 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/shipments returns 200 with shipments list", async () => {
    mockDbState.reset();
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
  });

  it("rejects unauthenticated POST /api/shipments with 401", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/shipments",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /api/shipments without CSRF with 403", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/shipments",
      payload: {},
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: Milestone Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/milestones/shipment/:id returns milestones", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/milestones/shipment/ship-1",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.shipmentId).toBe("ship-1");
  });

  it("POST /api/milestones creates a milestone with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/milestones",
      payload: {},
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toBe("Milestone created");
  });

  it("rejects unauthenticated milestone access with 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/milestones/shipment/ship-1",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /api/milestones without CSRF with 403", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/milestones",
      payload: {},
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: Tenant Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/tenants/current returns tenant info with JWT auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tenants/current",
      headers: authBearerHeader("tenant-int"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("tenantId");
    expect(body.data.tenantId).toBe("tenant-int");
  });

  it("GET /api/tenants/current returns tenant info with API key auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tenants/current",
      headers: apiKeyHeader("valid-test-key"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBe("tenant-int");
  });

  it("PATCH /api/tenants/current updates tenant with CSRF", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/api/tenants/current",
      payload: { name: "Updated" },
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("Tenant updated");
  });

  it("rejects unauthenticated tenant access with 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tenants/current",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects PATCH /api/tenants/current without CSRF with 403", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/api/tenants/current",
      payload: { name: "Updated" },
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: Notification Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/notifications/rules returns rules", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/notifications/rules",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("POST /api/notifications/rules creates rule with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: {},
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toBe("Notification rule created");
  });

  it("GET /api/notifications/history returns history", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/notifications/history",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("rejects unauthenticated notification access with 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/notifications/rules",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /api/notifications/rules without CSRF with 403", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: {},
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: API Key Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/api-keys returns empty list", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/api-keys",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("POST /api/api-keys creates a new key with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/api-keys",
      payload: {},
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.key).toBeDefined();
    expect(typeof body.data.key).toBe("string");
    expect(body.data.key.length).toBeGreaterThan(0);
  });

  it("POST /api/api-keys generates unique keys each time", async () => {
    const headers = authHeadersWithCsrf("tenant-1");
    const res1 = await server.inject({
      method: "POST",
      url: "/api/api-keys",
      payload: {},
      headers,
    });
    const res2 = await server.inject({
      method: "POST",
      url: "/api/api-keys",
      payload: {},
      headers,
    });
    expect(res1.json().data.key).not.toBe(res2.json().data.key);
  });

  it("DELETE /api/api-keys/:id revokes key with CSRF", async () => {
    const res = await server.inject({
      method: "DELETE",
      url: "/api/api-keys/key-123",
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain("key-123");
    expect(res.json().message).toContain("revoked");
  });

  it("rejects unauthenticated API key management with 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/api-keys",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects DELETE /api/api-keys/:id without CSRF with 403", async () => {
    const res = await server.inject({
      method: "DELETE",
      url: "/api/api-keys/key-123",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: CSV Import Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("POST /api/csv-import queues import with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/csv-import",
      payload: {},
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().message).toBe("CSV import queued");
  });

  it("GET /api/csv-import/:jobId/status returns job status", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/csv-import/job-abc/status",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.jobId).toBe("job-abc");
    expect(body.data.status).toBe("pending");
  });

  it("rejects unauthenticated CSV import with 401", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/csv-import",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /api/csv-import without CSRF with 403", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/csv-import",
      payload: {},
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Integration: Tracking Page Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /api/tracking-pages/:trackingId returns tracking data without auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tracking-pages/TRK-999",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.trackingId).toBe("TRK-999");
  });
});

describe("Integration: Error handling and edge cases", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns 401 for unknown routes without auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/unknown-endpoint",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for unknown routes with valid auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/unknown-endpoint",
      headers: authBearerHeader("tenant-1"),
    });
    expect(res.statusCode).toBe(404);
  });

  it("handles OPTIONS requests (CORS preflight)", async () => {
    const res = await server.inject({
      method: "OPTIONS",
      url: "/api/health",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it("handles OPTIONS on protected routes without auth", async () => {
    const res = await server.inject({
      method: "OPTIONS",
      url: "/api/shipments",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    });
    expect(res.statusCode).toBe(204);
  });

  it("handles POST with empty body with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/shipments",
      headers: authHeadersWithCsrf("tenant-1"),
    });
    expect(res.statusCode).toBe(201);
  });

  it("handles POST with JSON content-type with CSRF", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/shipments",
      headers: {
        ...authHeadersWithCsrf("tenant-1"),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ name: "test" }),
    });
    expect(res.statusCode).toBe(201);
  });

  it("GET /api/health responds quickly", async () => {
    const start = Date.now();
    await server.inject({ method: "GET", url: "/api/health" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it("rejects invalid JWT with proper error response", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
    expect(res.json().error).toBe("Invalid or expired token");
  });

  it("rejects invalid API key with proper error response", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: apiKeyHeader("invalid-key"),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
    expect(res.json().error).toBe("Invalid API key");
  });
});
