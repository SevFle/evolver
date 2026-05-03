import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ms";
  return null;
};

describe("Milestone Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/milestones/shipment/:shipmentId", () => {
    it("returns milestones for a shipment", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/milestones/shipment/ship-001",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.shipmentId).toBe("ship-001");
    });

    it("handles UUID-format shipment IDs", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const res = await server.inject({
        method: "GET",
        url: `/api/milestones/shipment/${uuid}`,
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().shipmentId).toBe(uuid);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/milestones/shipment/ship-1",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/milestones", () => {
    it("creates a milestone", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/milestones",
        payload: { type: "picked_up", description: "Picked up" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().message).toBe("Milestone created");
    });

    it("accepts empty payload", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/milestones",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/milestones",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
