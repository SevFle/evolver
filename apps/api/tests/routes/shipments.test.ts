import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, apiKeyHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ship";
  return null;
};

describe("Shipment Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/shipments", () => {
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
