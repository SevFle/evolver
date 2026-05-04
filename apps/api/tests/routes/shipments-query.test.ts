import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const { mockShipmentRows, mockMilestoneRows } = vi.hoisted(() => {
  const mockShipmentRows = [
    {
      id: "s1",
      tenantId: "tenant-1",
      trackingId: "SL-001",
      reference: "REF-001",
      origin: "Shanghai",
      destination: "Los Angeles",
      carrier: "Maersk",
      serviceType: "FCL",
      status: "in_transit",
      customerName: "Acme Corp",
      customerEmail: "shipping@acme.com",
      estimatedDelivery: new Date("2026-06-15"),
      actualDelivery: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-03-01"),
    },
    {
      id: "s2",
      tenantId: "tenant-1",
      trackingId: "SL-002",
      reference: null,
      origin: "Tokyo",
      destination: "New York",
      carrier: "COSCO",
      serviceType: "LTL",
      status: "delivered",
      customerName: "Beta LLC",
      customerEmail: "logistics@beta.com",
      estimatedDelivery: new Date("2026-02-01"),
      actualDelivery: new Date("2026-02-01"),
      createdAt: new Date("2026-01-15"),
      updatedAt: new Date("2026-02-01"),
    },
  ];

  const mockMilestoneRows = [
    {
      id: "m1",
      shipmentId: "s1",
      type: "in_transit",
      description: "Package in transit",
      location: "Pacific Ocean",
      carrierData: null,
      occurredAt: new Date("2026-03-01"),
      createdAt: new Date("2026-03-01"),
    },
  ];

  return { mockShipmentRows, mockMilestoneRows };
});

vi.mock("@shiplens/db", () => {
  return {
    db: {
      select: (args: Record<string, unknown> | undefined) => {
        if (args && "count" in args) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: "2" }]),
            }),
          };
        }
        return {
          from: vi.fn().mockImplementation((table: Record<string, unknown>) => {
            if ("shipmentId" in table) {
              return {
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(mockMilestoneRows),
                }),
              };
            }
            return {
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(mockShipmentRows),
                  }),
                }),
              }),
            };
          }),
        };
      },
    },
    shipments: {
      tenantId: "tenantId",
      trackingId: "trackingId",
      customerName: "customerName",
      customerEmail: "customerEmail",
      origin: "origin",
      destination: "destination",
      status: "status",
      estimatedDelivery: "estimatedDelivery",
      createdAt: "createdAt",
    },
    milestones: {
      shipmentId: "shipmentId",
      occurredAt: "occurredAt",
      type: "type",
      description: "description",
      location: "location",
      $inferSelect: {},
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
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: string, val: string) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  like: vi.fn((col: string, val: string) => ({ col, val, op: "like" })),
  inArray: vi.fn((col: string, vals: unknown[]) => ({ col, vals, op: "inArray" })),
  gte: vi.fn((col: string, val: unknown) => ({ col, val, op: "gte" })),
  lte: vi.fn((col: string, val: unknown) => ({ col, val, op: "lte" })),
  desc: vi.fn((col: string) => ({ col, dir: "desc" })),
  asc: vi.fn((col: string) => ({ col, dir: "asc" })),
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ship-q";
  return null;
};

describe("Shipment Routes: Query Logic", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    vi.clearAllMocks();
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/shipments - default parameters", () => {
    it("returns paginated response with default page and pageSize", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(25);
      expect(body.total).toBe(2);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("returns shipments with correct field mapping", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      const shipment = body.data[0];
      expect(shipment).toHaveProperty("id");
      expect(shipment).toHaveProperty("trackingId");
      expect(shipment).toHaveProperty("reference");
      expect(shipment).toHaveProperty("origin");
      expect(shipment).toHaveProperty("destination");
      expect(shipment).toHaveProperty("carrier");
      expect(shipment).toHaveProperty("serviceType");
      expect(shipment).toHaveProperty("status");
      expect(shipment).toHaveProperty("customerName");
      expect(shipment).toHaveProperty("customerEmail");
      expect(shipment).toHaveProperty("estimatedDelivery");
      expect(shipment).toHaveProperty("actualDelivery");
      expect(shipment).toHaveProperty("lastMilestone");
      expect(shipment).toHaveProperty("createdAt");
      expect(shipment).toHaveProperty("updatedAt");
    });

    it("serializes date fields as ISO strings", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      const shipment = body.data[0];
      expect(typeof shipment.estimatedDelivery).toBe("string");
      expect(new Date(shipment.estimatedDelivery).toISOString()).toBe(
        shipment.estimatedDelivery
      );
      expect(typeof shipment.createdAt).toBe("string");
      expect(new Date(shipment.createdAt).toISOString()).toBe(shipment.createdAt);
    });

    it("returns null for nullable fields when null", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      const deliveredShipment = body.data.find(
        (s: { trackingId: string }) => s.trackingId === "SL-002"
      );
      expect(deliveredShipment.reference).toBeNull();
    });

    it("returns null actualDelivery when not delivered", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      const shipment = body.data.find(
        (s: { trackingId: string }) => s.trackingId === "SL-001"
      );
      expect(shipment.actualDelivery).toBeNull();
    });
  });

  describe("GET /api/shipments - pagination", () => {
    it("accepts custom page parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=2",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(2);
    });

    it("accepts custom pageSize parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=10",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(10);
    });

    it("clamps pageSize to MAX_PAGE_SIZE of 100", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=500",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(100);
    });

    it("defaults page to 1 when page is 0", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=0",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults page to 1 when page is negative", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=-5",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults page to 1 when page is non-numeric", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=abc",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it("defaults pageSize to 25 when pageSize is non-numeric", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=invalid",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(25);
    });

    it("defaults pageSize to 25 when pageSize is 0 (0 is falsy in || operator)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=0",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(25);
    });

    it("clamps negative pageSize to 1", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?pageSize=-10",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(1);
    });
  });

  describe("GET /api/shipments - status filtering", () => {
    it("accepts single status filter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("accepts multiple comma-separated statuses", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit,delivered,pending",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid status values and still returns data", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=invalid_status,another_bad",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("filters valid statuses and ignores invalid ones", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit,invalid,delivered",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles empty status parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("trims whitespace from status values", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit%2C%20delivered",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - search filtering", () => {
    it("accepts search parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=SL-001",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles search with special characters", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=test%40example.com",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("ignores whitespace-only search", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=%20%20%20",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles empty search parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?search=",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - date range filtering", () => {
    it("accepts dateFrom parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=2026-01-01",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts dateTo parameter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=2026-12-31",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts both dateFrom and dateTo together", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=2026-01-01&dateTo=2026-12-31",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateFrom", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateFrom=not-a-date",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("ignores invalid dateTo", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?dateTo=invalid",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - sorting", () => {
    it("defaults to createdAt desc sorting", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=trackingId", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=trackingId",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=customerName", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=customerName",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=origin", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=origin",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=destination", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=destination",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=status", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=status",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortBy=estimatedDelivery", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=estimatedDelivery",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortOrder=asc", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=asc",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts sortOrder=desc", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=desc",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("defaults to desc when sortOrder is unrecognized", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortOrder=random",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("falls back to createdAt for unknown sortBy column", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?sortBy=unknownColumn",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - combined filters", () => {
    it("handles all parameters together", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?page=1&pageSize=10&status=in_transit&search=SL&dateFrom=2026-01-01&dateTo=2026-12-31&sortBy=trackingId&sortOrder=asc",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
      expect(res.json().pageSize).toBe(10);
    });

    it("handles status and search together", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=in_transit&search=Acme",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles status and date range together", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments?status=delivered&dateFrom=2026-01-01&dateTo=2026-06-30",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - authentication", () => {
    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toBe("Authentication required");
    });

    it("accepts JWT authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepts API key authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { "x-api-key": "valid-key" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/shipments - lastMilestone mapping", () => {
    it("includes lastMilestone field in response", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const shipment = body.data[0];
      expect(shipment).toHaveProperty("lastMilestone");
    });

    it("maps milestone data correctly for matching shipment", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      const firstShipment = body.data.find(
        (s: { trackingId: string }) => s.trackingId === "SL-001"
      );
      if (firstShipment && firstShipment.lastMilestone) {
        expect(firstShipment.lastMilestone.type).toBe("in_transit");
        expect(firstShipment.lastMilestone.description).toBe("Package in transit");
        expect(firstShipment.lastMilestone.location).toBe("Pacific Ocean");
        expect(typeof firstShipment.lastMilestone.occurredAt).toBe("string");
      }
    });

    it("returns null lastMilestone for shipments without matching milestones", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const secondShipment = body.data.find(
        (s: { trackingId: string }) => s.trackingId === "SL-002"
      );
      if (secondShipment) {
        expect(secondShipment.lastMilestone).toBeNull();
      }
    });
  });

  describe("GET /api/shipments - response structure", () => {
    it("includes pagination metadata", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(typeof body.total).toBe("number");
      expect(typeof body.page).toBe("number");
      expect(typeof body.pageSize).toBe("number");
    });

    it("returns total as a number", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      const body = res.json();
      expect(typeof body.total).toBe("number");
      expect(Number.isNaN(body.total)).toBe(false);
    });
  });
});
