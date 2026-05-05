import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET } from "../helpers/auth";

const mockShipment = {
  id: "s-1",
  tenantId: "tenant-1",
  trackingId: "SL-001",
  reference: "REF-001",
  origin: "Shanghai",
  destination: "Los Angeles",
  carrier: "Maersk",
  serviceType: "FCL",
  status: "in_transit",
  customerName: "Acme Corp",
  customerEmail: "acme@example.com",
  customerPhone: "1234567890",
  metadata: null,
  estimatedDelivery: new Date("2026-06-01"),
  actualDelivery: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const mockMilestone = {
  id: "m-1",
  shipmentId: "s-1",
  type: "in_transit" as const,
  description: "Departed origin port",
  location: "Shanghai",
  carrierData: null,
  occurredAt: new Date("2026-01-15T00:00:00Z"),
  createdAt: new Date("2026-01-15T00:00:00Z"),
};

function createChain(result: unknown): any {
  const chain: Record<string, any> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

let selectResults: unknown[] = [];

vi.mock("@shiplens/db", async () => {
  const actual = await vi.importActual<typeof import("@shiplens/db")>(
    "@shiplens/db"
  );
  return {
    ...actual,
    db: {
      select: vi.fn().mockImplementation(() => {
        const result = selectResults.shift();
        return createChain(result);
      }),
    },
  };
});

const mockResolver = async () => null;

describe("Shipment Routes - success paths", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    selectResults = [];
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns empty list when no shipments", async () => {
    selectResults.push([{ count: 0 }], []);

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

  it("returns shipments with data", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      [mockMilestone]
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].trackingId).toBe("SL-001");
    expect(body.data[0].customerName).toBe("Acme Corp");
    expect(body.data[0].origin).toBe("Shanghai");
    expect(body.data[0].destination).toBe("Los Angeles");
    expect(body.data[0].carrier).toBe("Maersk");
    expect(body.data[0].status).toBe("in_transit");
    expect(body.data[0].estimatedDelivery).toBe("2026-06-01T00:00:00.000Z");
    expect(body.data[0].lastMilestone).toEqual({
      type: "in_transit",
      description: "Departed origin port",
      location: "Shanghai",
      occurredAt: "2026-01-15T00:00:00.000Z",
    });
  });

  it("returns shipment without milestone when none exist", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].lastMilestone).toBeNull();
  });

  it("filters by status", async () => {
    selectResults.push(
      [{ count: 1 }],
      [{ ...mockShipment, status: "delivered" }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?status=delivered",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].status).toBe("delivered");
  });

  it("filters by multiple statuses", async () => {
    selectResults.push(
      [{ count: 2 }],
      [
        { ...mockShipment, id: "s-1", status: "in_transit" },
        { ...mockShipment, id: "s-2", trackingId: "SL-002", status: "delivered" },
      ],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?status=in_transit,delivered",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("ignores invalid status values", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?status=invalid_status",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("filters by search term", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?search=Acme",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].customerName).toBe("Acme Corp");
  });

  it("filters by dateFrom", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?dateFrom=2026-01-01",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("filters by dateTo", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?dateTo=2026-12-31",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("ignores invalid dateFrom", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?dateFrom=not-a-date",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("ignores invalid dateTo", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?dateTo=not-a-date",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by trackingId ascending", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=trackingId&sortOrder=asc",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by customerName", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=customerName",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by origin", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=origin",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by destination", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=destination",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by status", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=status",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("sorts by estimatedDelivery", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=estimatedDelivery",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("defaults to sorting by createdAt when sortBy is unrecognized", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?sortBy=unknown",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("paginates results", async () => {
    selectResults.push(
      [{ count: 50 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?page=2&pageSize=10",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.total).toBe(50);
  });

  it("clamps pageSize to MAX_PAGE_SIZE", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?pageSize=999",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().pageSize).toBe(100);
  });

  it("handles actualDelivery date", async () => {
    const deliveredShipment = {
      ...mockShipment,
      status: "delivered",
      actualDelivery: new Date("2026-05-30"),
    };
    selectResults.push(
      [{ count: 1 }],
      [deliveredShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].actualDelivery).toBe("2026-05-30T00:00:00.000Z");
  });

  it("handles null estimatedDelivery", async () => {
    const noEstShipment = {
      ...mockShipment,
      estimatedDelivery: null,
    };
    selectResults.push(
      [{ count: 1 }],
      [noEstShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].estimatedDelivery).toBeNull();
  });

  it("handles multiple milestones per shipment (only first used)", async () => {
    const milestone2 = {
      ...mockMilestone,
      id: "m-2",
      description: "Arrived at destination",
      location: "Los Angeles",
    };
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      [mockMilestone, milestone2]
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].lastMilestone.description).toBe(
      "Departed origin port"
    );
  });

  it("combines search and status filters", async () => {
    selectResults.push(
      [{ count: 1 }],
      [mockShipment],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?status=in_transit&search=Acme",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("ignores empty search string", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?search=   ",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("uses default page when page is invalid", async () => {
    selectResults.push(
      [{ count: 0 }],
      []
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments?page=abc",
      headers: authBearerHeader("tenant-1"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().page).toBe(1);
  });

  it("returns 401 without authentication", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
    });

    expect(res.statusCode).toBe(401);
  });
});
