import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { authPlugin, hashApiKey, verifyToken } from "../../src/plugins/auth";
import {
  createTestJwt,
  createExpiredJwt,
  DEFAULT_SECRET,
} from "../helpers/auth";
import jwt from "jsonwebtoken";

describe("auth plugin", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;
  const mockResolver = async (keyHash: string) => {
    if (keyHash === hashApiKey("valid-api-key")) return "tenant-abc";
    return null;
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = Fastify();
    await server.register(authPlugin, { apiKeyResolver: mockResolver });
    server.get("/test", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));
    server.get("/api/health", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));
    server.get("/api/health/detailed", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));
  });

  afterEach(async () => {
    await server.close();
  });

  describe("Bearer token (JWT) authentication", () => {
    it("extracts tenantId from a valid signed JWT", async () => {
      const token = createTestJwt({ tenantId: "tenant-123" });
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe("tenant-123");
    });

    it("rejects an expired JWT with 401", async () => {
      const token = createExpiredJwt({ tenantId: "tenant-123" });
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("rejects a JWT signed with wrong secret with 401", async () => {
      const token = jwt.sign(
        { tenantId: "tenant-123" },
        "wrong-secret-key!!!"
      );
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("rejects a JWT without tenantId claim with 401", async () => {
      const token = jwt.sign({ userId: "u1" }, DEFAULT_SECRET);
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid token: missing tenantId claim");
    });

    it("rejects empty Bearer token with 401", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: "Bearer " },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Missing token");
    });

    it("ignores non-Bearer authorization scheme", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Authentication required");
    });

    it("preserves additional claims in verified JWT", async () => {
      const token = createTestJwt({
        tenantId: "t1",
        role: "admin",
        email: "admin@example.com",
      });
      const decoded = verifyToken(token, DEFAULT_SECRET);
      expect(decoded.tenantId).toBe("t1");
      expect(decoded.role).toBe("admin");
      expect(decoded.email).toBe("admin@example.com");
    });
  });

  describe("API key authentication", () => {
    it("resolves tenantId from a valid API key via resolver", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "valid-api-key" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe("tenant-abc");
    });

    it("rejects unknown API key with 401", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "unknown-key" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid API key");
    });

    it("rejects API key when no resolver is configured", async () => {
      const noResolverServer = Fastify();
      await noResolverServer.register(authPlugin);
      noResolverServer.get("/test", async (request) => ({
        tenantId: request.tenantId ?? null,
      }));

      const res = await noResolverServer.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "any-key" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid API key");
      await noResolverServer.close();
    });

    it("prefers x-api-key over Bearer when both present", async () => {
      const token = createTestJwt({ tenantId: "jwt-tenant" });
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: {
          "x-api-key": "valid-api-key",
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe("tenant-abc");
    });
  });

  describe("unauthenticated requests", () => {
    it("returns 401 when no auth headers provided", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Authentication required");
    });

    it("returns 401 response includes success: false", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
      });

      expect(res.json().success).toBe(false);
    });
  });

  describe("public route bypass", () => {
    it("skips auth for /api/health URLs", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBeNull();
    });

    it("skips auth for /api/health subpaths", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health/detailed",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBeNull();
    });

    it("skips auth for OPTIONS requests", async () => {
      server.options("/test", async () => ({ ok: true }));

      const res = await server.inject({
        method: "OPTIONS",
        url: "/test",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles malformed JWT gracefully", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: "Bearer not-a-real-jwt" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid or expired token");
    });

    it("handles JWT with tampered payload", async () => {
      const token = createTestJwt({ tenantId: "tenant-123" });
      const parts = token.split(".");
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString()
      );
      payload.tenantId = "tampered-tenant";
      parts[1] = Buffer.from(JSON.stringify(payload))
        .toString("base64url")
        .replace(/=/g, "");
      const tamperedToken = parts.join(".");

      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${tamperedToken}` },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 500 when JWT_SECRET is missing", async () => {
      const savedSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const token = createTestJwt({ tenantId: "t1" }, "any-secret");
      const res = await server.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toBe("Server configuration error");
      process.env.JWT_SECRET = savedSecret;
    });

    it("handles resolver that throws an error", async () => {
      const throwingServer = Fastify();
      const throwingResolver = async () => {
        throw new Error("DB connection failed");
      };
      await throwingServer.register(authPlugin, {
        apiKeyResolver: throwingResolver,
      });
      throwingServer.get("/test", async (request) => ({
        tenantId: request.tenantId ?? null,
      }));

      const res = await throwingServer.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "any-key" },
      });

      expect(res.statusCode).toBe(500);
      await throwingServer.close();
    });
  });
});

describe("hashApiKey utility", () => {
  it("produces consistent SHA-256 hashes", () => {
    const hash1 = hashApiKey("test-key");
    const hash2 = hashApiKey("test-key");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different keys", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});

describe("verifyToken utility", () => {
  const secret = "test-verify-secret";

  it("returns decoded payload for valid token", () => {
    const token = jwt.sign({ tenantId: "t1", role: "admin" }, secret);
    const decoded = verifyToken(token, secret);
    expect(decoded.tenantId).toBe("t1");
    expect(decoded.role).toBe("admin");
  });

  it("throws for token signed with wrong secret", () => {
    const token = jwt.sign({ tenantId: "t1" }, "wrong");
    expect(() => verifyToken(token, secret)).toThrow();
  });

  it("throws for expired token", () => {
    const token = jwt.sign({ tenantId: "t1" }, secret, {
      expiresIn: "-1s",
    });
    expect(() => verifyToken(token, secret)).toThrow();
  });

  it("throws for malformed token", () => {
    expect(() => verifyToken("garbage", secret)).toThrow();
  });
});
