import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import {
  authBearerHeader,
  apiKeyHeader,
  DEFAULT_SECRET,
  createCsrfToken,
} from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("@shiplens/db", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...(mod as Record<string, unknown>),
    db: { select: mockSelect },
  };
});

function chainable<T>(result: T) {
  const mock: Record<string, unknown> = {
    then: (resolve: (v: T) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };
  return mock as unknown as Promise<T> & Record<string, ReturnType<typeof vi.fn>>;
}

function makeShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: "s-1",
    trackingId: "SL-ABC123",
    reference: "REF-001",
    origin: "Shanghai",
    destination: "Los Angeles",
    carrier: "Maersk",
    serviceType: "FCL",
    status: "in_transit",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    estimatedDelivery: new Date("2024-06-15T00:00:00.000Z"),
    actualDelivery: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-15T00:00:00.000Z"),
    ...overrides,
  };
}

function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    shipmentId: "s-1",
    type: "departed_origin",
    description: "Departed from origin port",
    location: "Shanghai",
    carrierData: null,
    occurredAt: new Date("2024-02-01T10:00:00.000Z"),
    createdAt: new Date("2024-02-01T10:00:00.000Z"),
    ...overrides,
  };
}

function setupListMocks(opts: {
  count: string;
  shipments?: ReturnType<typeof makeShipment>[];
  milestones?: ReturnType<typeof makeMilestone>[];
}) {
  mockSelect
    .mockReturnValueOnce(chainable([{ count: opts.count }]))
    .mockReturnValueOnce(
      chainable(opts.shipments ?? [makeShipment()])
    )
    .mockReturnValueOnce(
      chainable(opts.milestones ?? [])
    );
}

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ship";
  return null;
};

describe("Shipment Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    mockSelect.mockReset();
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/shipments - success paths", () => {
    it("returns 200 with shipments and milestones", async () => {
      const shipment = makeShipment();
      const milestone = makeMilestone();
      setupListMocks({ count: "1", shipments: [shipment], milestones: [milestone] });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("s-1");
      expect(body.data[0].trackingId).toBe("SL-ABC123");
      expect(body.data[0].origin).toBe("Shanghai");
      expect(body.data[0].destination).toBe("Los Angeles");
      expect(body.data[0].status).toBe("in_transit");
      expect(body.data[0].estimatedDelivery).toBe("2024-06-15T00:00:00.000Z");
      expect(body.data[0].actualDelivery).toBeNull();
      expect(body.data[0].lastMilestone).toEqual({
        type: "departed_origin",
        description: "Departed from origin port",
        location: "Shanghai",
        occurredAt: "2024-02-01T10:00:00.000Z",
      });
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
    });

    it("returns 200 with empty data when no shipments exist", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

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
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
    });

    it("filters by a single status", async () => {
      setupListMocks({
        count: "1",
        shipments: [makeShipment({ status: "delivered" })],
      });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=delivered",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].status).toBe("delivered");
    });

    it("filters by multiple comma-separated statuses", async () => {
      setupListMocks({
        count: "2",
        shipments: [
          makeShipment({ id: "s-1", status: "pending" }),
          makeShipment({ id: "s-2", status: "in_transit", trackingId: "SL-DEF456" }),
        ],
        milestones: [],
      });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=pending,in_transit",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(2);
    });

    it("ignores invalid status values in the filter", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=invalid_status",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("filters by search term (trackingId / customerName / customerEmail)", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=Jane",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("ignores whitespace-only search term", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=%20%20",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("filters by dateFrom with a valid date", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=2024-01-01",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("filters by dateTo with a valid date", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=2024-12-31",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateFrom value gracefully", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=not-a-date",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateTo value gracefully", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=not-a-date",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by trackingId when sortBy=trackingId", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=trackingId",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by customerName when sortBy=customerName", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=customerName",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by origin when sortBy=origin", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=origin",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by destination when sortBy=destination", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=destination",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by status when sortBy=status", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=status",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts by estimatedDelivery when sortBy=estimatedDelivery", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=estimatedDelivery",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("defaults to createdAt sort for unknown sortBy value", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=unknown",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts ascending when sortOrder=asc", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=asc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("sorts descending by default when sortOrder is not asc", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=desc",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
    });

    it("respects custom page and pageSize query params", async () => {
      setupListMocks({ count: "50" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=2&pageSize=10",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
    });

    it("clamps pageSize to MAX_PAGE_SIZE (100)", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=200",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(100);
    });

    it("clamps negative page to 1 and negative pageSize to 1", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=-5&pageSize=-1",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(1);
    });

    it("handles non-numeric page and pageSize as defaults", async () => {
      mockSelect
        .mockReturnValueOnce(chainable([{ count: "0" }]))
        .mockReturnValueOnce(chainable([]));

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=abc&pageSize=xyz",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
    });

    it("serializes null estimatedDelivery and actualDelivery as null", async () => {
      setupListMocks({
        count: "1",
        shipments: [makeShipment({ estimatedDelivery: null, actualDelivery: null })],
      });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data[0];
      expect(data.estimatedDelivery).toBeNull();
      expect(data.actualDelivery).toBeNull();
    });

    it("sets lastMilestone to null when shipment has no milestones", async () => {
      setupListMocks({ count: "1", milestones: [] });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].lastMilestone).toBeNull();
    });

    it("maps only the first (most recent) milestone per shipment", async () => {
      const shipment = makeShipment();
      const ms1 = makeMilestone({
        description: "Most recent",
        occurredAt: new Date("2024-03-01T10:00:00.000Z"),
      });
      const ms2 = makeMilestone({
        description: "Older",
        occurredAt: new Date("2024-01-15T10:00:00.000Z"),
      });

      setupListMocks({ count: "1", shipments: [shipment], milestones: [ms1, ms2] });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].lastMilestone.description).toBe("Most recent");
    });

    it("maps milestones correctly across multiple shipments", async () => {
      const s1 = makeShipment({ id: "s-1" });
      const s2 = makeShipment({ id: "s-2", trackingId: "SL-XYZ789" });
      const ms1 = makeMilestone({ shipmentId: "s-1", type: "booked", description: "Booked" });
      const ms2 = makeMilestone({ shipmentId: "s-2", type: "in_transit", description: "In transit" });

      setupListMocks({ count: "2", shipments: [s1, s2], milestones: [ms1, ms2] });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].lastMilestone.type).toBe("booked");
      expect(body.data[1].lastMilestone.type).toBe("in_transit");
    });

    it("works with API key authentication", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: apiKeyHeader("valid-key"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("serializes actualDelivery date correctly", async () => {
      setupListMocks({
        count: "1",
        shipments: [makeShipment({ actualDelivery: new Date("2024-06-10T14:30:00.000Z") })],
      });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].actualDelivery).toBe("2024-06-10T14:30:00.000Z");
    });

    it("combines status, search, dateFrom, and dateTo filters together", async () => {
      setupListMocks({ count: "1" });

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit&search=Jane&dateFrom=2024-01-01&dateTo=2024-12-31&sortBy=trackingId&sortOrder=asc&page=1&pageSize=10",
        headers: authBearerHeader("t1"),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });
  });

  describe("GET /api/shipments - error paths", () => {
    it("returns 500 when database is unavailable", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Failed to retrieve shipments");
    });

    it("returns 500 with API key auth when database is unavailable", async () => {
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
  });

  describe("POST /api/shipments", () => {
    it("returns 201 with success message", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: { origin: "Shanghai", destination: "LA" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
      expect(res.json().message).toBe("Shipment created");
    });

    it("accepts empty payload", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
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
