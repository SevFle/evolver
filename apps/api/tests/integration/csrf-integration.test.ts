import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import {
  authBearerHeader,
  DEFAULT_SECRET,
} from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";
import { createCsrfToken } from "../../src/plugins/csrf";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-csrf";
  return null;
};

describe("Integration: CSRF Protection on State-Changing Endpoints", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let csrfSecret: string;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    csrfSecret = DEFAULT_SECRET;
    process.env.CSRF_SECRET = csrfSecret;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
    delete process.env.CSRF_SECRET;
  });

  function validHeaders(tenantId: string) {
    return {
      ...authBearerHeader(tenantId),
      "x-csrf-token": createCsrfToken(csrfSecret),
    };
  }

  describe("POST endpoints require CSRF token", () => {
    const postEndpoints = [
      "/api/shipments",
      "/api/milestones",
      "/api/notifications/rules",
      "/api/api-keys",
      "/api/csv-import",
    ];

    for (const url of postEndpoints) {
      it(`POST ${url} rejects without CSRF token`, async () => {
        const res = await server.inject({
          method: "POST",
          url,
          payload: {},
          headers: authBearerHeader("tenant-1"),
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("CSRF token missing");
        expect(res.json().success).toBe(false);
      });

      it(`POST ${url} accepts with valid CSRF token`, async () => {
        const res = await server.inject({
          method: "POST",
          url,
          payload: {},
          headers: validHeaders("tenant-1"),
        });
        expect(res.statusCode).not.toBe(403);
      });
    }
  });

  describe("PATCH endpoints require CSRF token", () => {
    it("PATCH /api/tenants/current rejects without CSRF", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: { name: "Test" },
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });

    it("PATCH /api/tenants/current accepts with valid CSRF", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: { name: "Test" },
        headers: validHeaders("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("DELETE endpoints require CSRF token", () => {
    it("DELETE /api/api-keys/:id rejects without CSRF", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/key-1",
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });

    it("DELETE /api/api-keys/:id accepts with valid CSRF", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/key-1",
        headers: validHeaders("tenant-1"),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("invalid CSRF tokens are rejected", () => {
    it("rejects CSRF token from wrong secret", async () => {
      const badCsrf = createCsrfToken("wrong-secret-for-csrf");
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers: {
          ...authBearerHeader("tenant-1"),
          "x-csrf-token": badCsrf,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token invalid");
    });

    it("rejects random string as CSRF token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers: {
          ...authBearerHeader("tenant-1"),
          "x-csrf-token": "random-garbage-value",
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token invalid");
    });

    it("rejects empty CSRF token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers: {
          ...authBearerHeader("tenant-1"),
          "x-csrf-token": "",
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });
  });

  describe("GET endpoints do NOT require CSRF token", () => {
    const getEndpoints = [
      "/api/health",
      "/api/shipments",
      "/api/milestones/shipment/s1",
      "/api/tenants/current",
      "/api/notifications/rules",
      "/api/notifications/history",
      "/api/api-keys",
      "/api/tracking-pages/TRK-1",
    ];

    for (const url of getEndpoints) {
      const needsAuth = !url.startsWith("/api/health") && !url.startsWith("/api/tracking-pages");
      it(`GET ${url} does not require CSRF token`, async () => {
        const headers = needsAuth ? authBearerHeader("tenant-1") : undefined;
        const res = await server.inject({ method: "GET", url, headers });
        expect(res.statusCode).not.toBe(403);
      });
    }
  });

  describe("CSRF token can be reused across multiple requests", () => {
    it("same CSRF token works for multiple state-changing requests", async () => {
      const headers = validHeaders("tenant-1");

      const post1 = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers,
      });
      expect(post1.statusCode).toBe(201);

      const post2 = await server.inject({
        method: "POST",
        url: "/api/api-keys",
        headers,
      });
      expect(post2.statusCode).toBe(201);

      const patch = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: {},
        headers,
      });
      expect(patch.statusCode).toBe(200);

      const del = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/test",
        headers,
      });
      expect(del.statusCode).toBe(200);
    });
  });

  describe("public routes bypass CSRF on state-changing methods", () => {
    it("POST to /api/health does not require auth or CSRF", async () => {
      const server2 = await buildServer({ apiKeyResolver: mockResolver });
      server2.post("/api/health/webhook", async () => ({ ok: true }));
      const res = await server2.inject({
        method: "POST",
        url: "/api/health/webhook",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      await server2.close();
    });
  });

  describe("combined auth + CSRF rejection order", () => {
    it("returns 401 (auth) before 403 (CSRF) when both missing", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 (CSRF) when auth is present but CSRF missing", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers: authBearerHeader("tenant-1"),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
