import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import {
  authBearerHeader,
  apiKeyHeader,
  DEFAULT_SECRET,
  createCsrfToken,
} from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    results: [] as any[][],
    shouldThrow: false,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _eq: val })),
  and: vi.fn((...conds: any[]) => ({ _and: conds })),
  or: vi.fn((...conds: any[]) => ({ _or: conds })),
  like: vi.fn((_col: any, val: any) => ({ _like: val })),
  inArray: vi.fn((_col: any, vals: any[]) => ({ _inArray: vals })),
  gte: vi.fn((_col: any, val: any) => ({ _gte: val })),
  lte: vi.fn((_col: any, val: any) => ({ _lte: val })),
  desc: vi.fn((col: any) => ({ _desc: col })),
  asc: vi.fn((col: any) => ({ _asc: col })),
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

vi.mock("@shiplens/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => {
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        then(resolve: any, reject: any) {
          if (mockDb.shouldThrow) {
            Promise.reject(new Error("Database unavailable")).then(
              undefined,
              reject
            );
            return;
          }
          const result = mockDb.results.shift() ?? [];
          Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    }),
  },
  shipments: {
    tenantId: "tenantId",
    status: "status",
    trackingId: "trackingId",
    customerName: "customerName",
    customerEmail: "customerEmail",
    estimatedDelivery: "estimatedDelivery",
    createdAt: "createdAt",
    origin: "origin",
    destination: "destination",
  },
  milestones: {
    shipmentId: "shipmentId",
    occurredAt: "occurredAt",
    type: "type",
    description: "description",
    location: "location",
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

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ship";
  return null;
};

const makeShipment = (overrides: Record<string, any> = {}) => ({
  id: "ship-1",
  trackingId: "SL-001",
  reference: "REF-001",
  origin: "Shanghai",
  destination: "Los Angeles",
  carrier: "Maersk",
  serviceType: "standard",
  status: "in_transit",
  customerName: "John Doe",
  customerEmail: "john@example.com",
  estimatedDelivery: new Date("2024-06-15T00:00:00.000Z"),
  actualDelivery: new Date("2024-06-14T10:30:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  ...overrides,
});

const makeMilestone = (overrides: Record<string, any> = {}) => ({
  id: "ms-1",
  shipmentId: "ship-1",
  type: "picked_up",
  description: "Package picked up",
  location: "Shanghai Port",
  occurredAt: new Date("2024-01-15T10:00:00.000Z"),
  createdAt: new Date("2024-01-15T10:00:00.000Z"),
  ...overrides,
});

describe("Shipment Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    mockDb.results = [];
    mockDb.shouldThrow = false;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/shipments", () => {
    it("returns paginated shipments with milestones", async () => {
      const shipment = makeShipment();
      const milestone = makeMilestone();
      mockDb.results = [
        [{ count: "1" }],
        [shipment],
        [milestone],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("ship-1");
      expect(body.data[0].trackingId).toBe("SL-001");
      expect(body.data[0].reference).toBe("REF-001");
      expect(body.data[0].origin).toBe("Shanghai");
      expect(body.data[0].destination).toBe("Los Angeles");
      expect(body.data[0].carrier).toBe("Maersk");
      expect(body.data[0].serviceType).toBe("standard");
      expect(body.data[0].status).toBe("in_transit");
      expect(body.data[0].customerName).toBe("John Doe");
      expect(body.data[0].customerEmail).toBe("john@example.com");
      expect(body.data[0].estimatedDelivery).toBe(
        "2024-06-15T00:00:00.000Z"
      );
      expect(body.data[0].actualDelivery).toBe("2024-06-14T10:30:00.000Z");
      expect(body.data[0].lastMilestone).toEqual({
        type: "picked_up",
        description: "Package picked up",
        location: "Shanghai Port",
        occurredAt: "2024-01-15T10:00:00.000Z",
      });
      expect(body.data[0].createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(body.data[0].updatedAt).toBe("2024-01-02T00:00:00.000Z");
    });

    it("returns shipments with null milestone when no milestones exist", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment()],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].lastMilestone).toBeNull();
    });

    it("returns shipments with null dates when estimatedDelivery and actualDelivery are null", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment({ estimatedDelivery: null, actualDelivery: null })],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].estimatedDelivery).toBeNull();
      expect(res.json().data[0].actualDelivery).toBeNull();
    });

    it("returns empty list when no shipments exist", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("filters by single valid status", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment({ status: "delivered" })],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=delivered",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it("filters by multiple valid statuses", async () => {
      mockDb.results = [
        [{ count: "2" }],
        [makeShipment(), makeShipment({ id: "ship-2", status: "delivered" })],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit,delivered",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(2);
    });

    it("ignores invalid status values", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=invalid_status,also_invalid",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it("filters by search term", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment()],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=John",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it("skips search when term is empty or whitespace-only", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=%20%20",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("filters by valid dateFrom", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment()],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=2024-01-01",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateFrom", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=not-a-date",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("filters by valid dateTo", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment()],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=2024-12-31",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateTo", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=invalid",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by trackingId", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=trackingId",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by customerName", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=customerName",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by origin", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=origin",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by destination", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=destination",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by status", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=status",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by estimatedDelivery", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=estimatedDelivery",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("defaults sort to createdAt when sortBy is unrecognized", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=unknown_field",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts ascending when sortOrder=asc", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=asc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts descending when sortOrder is not asc", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=desc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("respects page and pageSize params", async () => {
      mockDb.results = [
        [{ count: "50" }],
        [makeShipment()],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=2&pageSize=10",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(2);
      expect(res.json().pageSize).toBe(10);
    });

    it("defaults page to 1 when page is invalid", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=abc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults page to 1 when page is 0", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=0",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults page to 1 when page is negative", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=-5",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults pageSize when pageSize is invalid", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=abc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(25);
    });

    it("caps pageSize to MAX_PAGE_SIZE (100)", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=500",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(100);
    });

    it("sets pageSize to 1 when pageSize is 0", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=0",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(25);
    });

    it("sets pageSize to 1 when pageSize is negative", async () => {
      mockDb.results = [
        [{ count: "0" }],
        [],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=-10",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(1);
    });

    it("uses only first milestone per shipment when multiple exist", async () => {
      const shipment = makeShipment();
      mockDb.results = [
        [{ count: "1" }],
        [shipment],
        [
          makeMilestone({ type: "delivered", description: "Delivered" }),
          makeMilestone({ type: "picked_up", description: "Picked up" }),
        ],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].lastMilestone.type).toBe("delivered");
    });

    it("handles multiple shipments with mixed milestone presence", async () => {
      const s1 = makeShipment();
      const s2 = makeShipment({
        id: "ship-2",
        trackingId: "SL-002",
        estimatedDelivery: null,
        actualDelivery: null,
      });
      mockDb.results = [
        [{ count: "2" }],
        [s1, s2],
        [makeMilestone({ shipmentId: "ship-1" })],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data).toHaveLength(2);
      expect(data[0].lastMilestone).not.toBeNull();
      expect(data[1].lastMilestone).toBeNull();
      expect(data[1].estimatedDelivery).toBeNull();
      expect(data[1].actualDelivery).toBeNull();
    });

    it("returns 500 when database throws an error", async () => {
      mockDb.shouldThrow = true;

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toBe("Failed to retrieve shipments");
    });

    it("returns 500 with API key auth when database throws", async () => {
      mockDb.shouldThrow = true;

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: apiKeyHeader("valid-key"),
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().success).toBe(false);
    });

    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
      });

      expect(res.statusCode).toBe(401);
    });

    it("handles combined filters: status, search, dateFrom, dateTo, sortBy, sortOrder", async () => {
      mockDb.results = [
        [{ count: "1" }],
        [makeShipment()],
        [makeMilestone()],
      ];

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit&search=John&dateFrom=2024-01-01&dateTo=2024-12-31&sortBy=trackingId&sortOrder=asc&page=1&pageSize=50",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
      expect(res.json().pageSize).toBe(50);
    });
  });

  describe("POST /api/shipments", () => {
    it("returns 201 with success message", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: { origin: "Shanghai", destination: "LA" },
        headers: {
          ...authBearerHeader("t1"),
          "x-csrf-token": createCsrfToken(),
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
      expect(res.json().message).toBe("Shipment created");
    });

    it("accepts empty payload", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        headers: {
          ...authBearerHeader("t1"),
          "x-csrf-token": createCsrfToken(),
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/shipments/:trackingId", () => {
    it("returns shipment data with matching trackingId", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments/SL-ABC123",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("SL-ABC123");
    });

    it("handles tracking IDs with hyphens and numbers", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments/SL-2024-001",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("SL-2024-001");
    });

    it("handles URL-encoded tracking IDs", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments/tracking%20id",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("tracking id");
    });

    it("handles long tracking IDs within URL limits", async () => {
      const longId = "SL-" + "A".repeat(50);
      const res = await server.inject({
        method: "GET",
        url: `/api/shipments/${longId}`,
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe(longId);
    });

    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments/SL-123",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
