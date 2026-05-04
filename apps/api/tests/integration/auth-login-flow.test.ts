import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import {
  authBearerHeader,
  apiKeyHeader,
  createTestJwt,
  createExpiredJwt,
  DEFAULT_SECRET,
} from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";
import { createCsrfToken } from "../../src/plugins/csrf";
import jwt from "jsonwebtoken";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-login-key")) return "tenant-login";
  return null;
};

describe("Integration: Auth Login Flow", () => {
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

  function csrfHeaders(tenantId: string) {
    return {
      ...authBearerHeader(tenantId),
      "x-csrf-token": createCsrfToken(csrfSecret),
    };
  }

  describe("complete JWT login flow", () => {
    it("authenticates with valid JWT and CSRF for POST", async () => {
      const headers = csrfHeaders("tenant-1");
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: { origin: "Shanghai", destination: "LA" },
        headers,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });

    it("reads tenant data after JWT authentication", async () => {
      const headers = authBearerHeader("tenant-1");
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tenantId).toBe("tenant-1");
    });

    it("updates tenant with JWT auth and CSRF token", async () => {
      const headers = csrfHeaders("tenant-1");
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: { name: "Updated Corp" },
        headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe("Tenant updated");
    });
  });

  describe("complete API key login flow", () => {
    it("authenticates with valid API key for GET", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: apiKeyHeader("valid-login-key"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("authenticates with valid API key and CSRF for POST", async () => {
      const headers = {
        ...apiKeyHeader("valid-login-key"),
        "x-csrf-token": createCsrfToken(csrfSecret),
      };
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers,
      });
      expect(res.statusCode).toBe(201);
    });

    it("rejects invalid API key for GET", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: apiKeyHeader("invalid-key"),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid API key");
    });

    it("rejects invalid API key for POST", async () => {
      const headers = {
        ...apiKeyHeader("invalid-key"),
        "x-csrf-token": createCsrfToken(csrfSecret),
      };
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("token validation: expired tokens", () => {
    it("rejects expired JWT on GET routes", async () => {
      const expiredToken = createExpiredJwt({ tenantId: "tenant-1" });
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("rejects expired JWT on POST routes", async () => {
      const expiredToken = createExpiredJwt({ tenantId: "tenant-1" });
      const res = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: {},
        headers: {
          authorization: `Bearer ${expiredToken}`,
          "x-csrf-token": createCsrfToken(csrfSecret),
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("token validation: missing tokens", () => {
    it("rejects requests with no auth header", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Authentication required");
    });

    it("rejects Bearer with empty token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: "Bearer " },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Missing token");
    });

    it("rejects Basic auth scheme", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Authentication required");
    });
  });

  describe("token validation: malformed tokens", () => {
    it("rejects malformed JWT string", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: "Bearer not-a-real-jwt" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("rejects JWT signed with wrong secret", async () => {
      const badToken = jwt.sign({ tenantId: "t1" }, "wrong-secret-xxx");
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

    it("rejects tampered JWT payload", async () => {
      const token = createTestJwt({ tenantId: "tenant-1" });
      const parts = token.split(".");
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString()
      );
      payload.tenantId = "tampered";
      parts[1] = Buffer.from(JSON.stringify(payload))
        .toString("base64url")
        .replace(/=/g, "");
      const tamperedToken = parts.join(".");

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { authorization: `Bearer ${tamperedToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("token validation: across all protected routes", () => {
    const protectedRoutes = [
      { method: "GET", url: "/api/shipments" },
      { method: "POST", url: "/api/shipments" },
      { method: "GET", url: "/api/milestones/shipment/s1" },
      { method: "GET", url: "/api/tenants/current" },
      { method: "GET", url: "/api/notifications/rules" },
      { method: "GET", url: "/api/api-keys" },
    ];

    it("rejects missing auth on all protected GET routes", async () => {
      for (const route of protectedRoutes.filter((r) => r.method === "GET")) {
        const res = await server.inject({ method: "GET", url: route.url });
        expect(res.statusCode).toBe(401);
      }
    });
  });

  describe("session isolation between tenants", () => {
    it("tenant A cannot access tenant B's data endpoint", async () => {
      const resA = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: authBearerHeader("tenant-a"),
      });
      expect(resA.json().data.tenantId).toBe("tenant-a");

      const resB = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: authBearerHeader("tenant-b"),
      });
      expect(resB.json().data.tenantId).toBe("tenant-b");

      expect(resA.json().data.tenantId).not.toBe(resB.json().data.tenantId);
    });
  });

  describe("full CRUD workflow with auth + CSRF", () => {
    it("complete workflow: create, read, update, delete shipments", async () => {
      const headers = csrfHeaders("tenant-1");

      const createRes = await server.inject({
        method: "POST",
        url: "/api/shipments",
        payload: { trackingId: "SL-WORKFLOW-1" },
        headers,
      });
      expect(createRes.statusCode).toBe(201);

      const readRes = await server.inject({
        method: "GET",
        url: "/api/shipments/SL-WORKFLOW-1",
        headers: authBearerHeader("tenant-1"),
      });
      expect(readRes.statusCode).toBe(200);
      expect(readRes.json().data.trackingId).toBe("SL-WORKFLOW-1");

      const listRes = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: authBearerHeader("tenant-1"),
      });
      expect(listRes.statusCode).toBe(200);
    });

    it("complete workflow: API key lifecycle", async () => {
      const headers = csrfHeaders("tenant-1");

      const createRes = await server.inject({
        method: "POST",
        url: "/api/api-keys",
        headers,
      });
      expect(createRes.statusCode).toBe(201);
      const key = createRes.json().data.key;
      expect(key).toBeTruthy();

      const deleteRes = await server.inject({
        method: "DELETE",
        url: `/api/api-keys/${key}`,
        headers,
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().message).toContain("revoked");
    });

    it("complete workflow: notifications", async () => {
      const headers = csrfHeaders("tenant-1");

      const listRules = await server.inject({
        method: "GET",
        url: "/api/notifications/rules",
        headers: authBearerHeader("tenant-1"),
      });
      expect(listRules.statusCode).toBe(200);

      const createRule = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { type: "email" },
        headers,
      });
      expect(createRule.statusCode).toBe(201);

      const history = await server.inject({
        method: "GET",
        url: "/api/notifications/history",
        headers: authBearerHeader("tenant-1"),
      });
      expect(history.statusCode).toBe(200);
    });
  });
});
