import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, apiKeyHeader, DEFAULT_SECRET } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";
import jwt from "jsonwebtoken";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-integ";
  return null;
};

describe("Integration: Comprehensive Edge Cases", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("Authentication integration", () => {
    it("JWT with extra claims preserves tenantId", async () => {
      const token = jwt.sign(
        { tenantId: "t1", role: "admin", email: "admin@test.com" },
        DEFAULT_SECRET
      );
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tenantId).toBe("t1");
    });

    it("API key auth sets correct tenantId", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: apiKeyHeader("valid-key"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tenantId).toBe("tenant-integ");
    });

    it("rejects expired JWT across all routes", async () => {
      const expiredToken = jwt.sign({ tenantId: "t1" }, DEFAULT_SECRET, {
        expiresIn: "-1s",
      });
      const routes = [
        "/api/shipments",
        "/api/milestones/shipment/s1",
        "/api/tenants/current",
        "/api/notifications/rules",
        "/api/api-keys",
      ];
      for (const url of routes) {
        const res = await server.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${expiredToken}` },
        });
        expect(res.statusCode).toBe(401);
      }
    });

    it("rejects wrong-signature JWT", async () => {
      const badToken = jwt.sign({ tenantId: "t1" }, "wrong-secret");
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: `Bearer ${badToken}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("rejects JWT without tenantId claim", async () => {
      const token = jwt.sign({ userId: "u1" }, DEFAULT_SECRET);
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid token: missing tenantId claim");
    });

    it("CORS preflight bypasses auth on all routes", async () => {
      const routes = [
        "/api/shipments",
        "/api/milestones/shipment/s1",
        "/api/tenants/current",
        "/api/notifications/rules",
        "/api/api-keys",
        "/api/csv-import",
      ];
      for (const url of routes) {
        const res = await server.inject({
          method: "OPTIONS",
          url,
          headers: {
            origin: "http://localhost:3000",
            "access-control-request-method": "GET",
          },
        });
        expect(res.statusCode).toBe(204);
      }
    });
  });

  describe("Public routes", () => {
    it("health endpoint accessible without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health",
      });
      expect(res.statusCode).toBe(200);
    });

    it("tracking pages accessible without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/TRK-001",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("TRK-001");
    });
  });

  describe("HTTP methods", () => {
    it("POST to shipment creates resource", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: { trackingId: "SL-NEW", origin: "NYC", destination: "LAX" },
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(201);
    });

    it("PATCH to tenant updates resource", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: { name: "Updated" },
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("DELETE to api-keys revokes key", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/key-1",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("Response format consistency", () => {
    it("all successful responses include success: true", async () => {
      const headers = authBearerHeader("t1");

      const endpoints = [
        { method: "GET", url: "/api/shipments", headers },
        { method: "GET", url: "/api/milestones/shipment/s1", headers },
        { method: "GET", url: "/api/tenants/current", headers },
        { method: "GET", url: "/api/notifications/rules", headers },
        { method: "GET", url: "/api/notifications/history", headers },
        { method: "GET", url: "/api/api-keys", headers },
        { method: "GET", url: "/api/tracking-pages/T1" },
      ];

      for (const { method, url, headers: hdrs } of endpoints) {
        const res = await server.inject({ method: method as "GET", url, headers: hdrs as Record<string, string> | undefined });
        const body = res.json();
        expect(body.success).toBe(true);
      }
    });

    it("all error responses include success: false and error message", async () => {
      const protectedUrls = [
        "/api/shipments",
        "/api/milestones/shipment/s1",
        "/api/tenants/current",
        "/api/notifications/rules",
        "/api/api-keys",
      ];

      for (const url of protectedUrls) {
        const res = await server.inject({ method: "GET", url });
        const body = res.json();
        expect(body.success).toBe(false);
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Rate limiting", () => {
    it("includes rate limit headers on responses", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health",
      });
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    });
  });

  describe("Tracking page deep link variations", () => {
    it("handles various tracking ID formats", async () => {
      const trackingIds = [
        "SL-ABC123",
        "TRK-2024-001",
        "12345",
        "ABC-DEF-GHI",
      ];

      for (const id of trackingIds) {
        const res = await server.inject({
          method: "GET",
          url: `/api/tracking-pages/${id}`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.trackingId).toBe(id);
      }
    });
  });

  describe("CSV import job status", () => {
    it("returns pending status for any job ID", async () => {
      const jobIds = ["job-1", "job-uuid-123", "JOB_UPPER"];
      const hdrs = authBearerHeader("t1");

      for (const jobId of jobIds) {
        const res = await server.inject({
          method: "GET",
          url: `/api/csv-import/${jobId}/status`,
          headers: hdrs,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.jobId).toBe(jobId);
        expect(res.json().data.status).toBe("pending");
      }
    });
  });
});
