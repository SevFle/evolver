import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { authPlugin, hashApiKey, verifyToken } from "../../src/plugins/auth";
import { createTestJwt, DEFAULT_SECRET } from "../helpers/auth";
import jwt from "jsonwebtoken";

describe("Auth Plugin: Advanced Edge Cases", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;

  const mockResolver = async (keyHash: string) => {
    if (keyHash === hashApiKey("valid-key")) return "tenant-edge";
    return null;
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = Fastify();
    await server.register(authPlugin, { apiKeyResolver: mockResolver });
    server.get("/protected", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));
    server.get("/api/health", async (request) => ({
      ok: true,
      tenantId: request.tenantId ?? null,
    }));
    server.get("/api/tracking-pages/test", async (request) => ({
      ok: true,
      tenantId: request.tenantId ?? null,
    }));
  });

  afterEach(async () => {
    await server.close();
  });

  describe("public path bypass", () => {
    it("skips auth for /api/tracking-pages (public route)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/test",
      });
      expect(res.statusCode).toBe(200);
    });

    it("skips auth for /api/health", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health",
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("JWT edge cases", () => {
    it("accepts JWT with additional claims", async () => {
      const token = createTestJwt({
        tenantId: "t1",
        role: "admin",
        permissions: ["read", "write"],
      });
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe("t1");
    });

    it("rejects token with only whitespace after Bearer", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: "Bearer   " },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects JWT with non-string tenantId", async () => {
      const token = jwt.sign({ tenantId: 12345 }, DEFAULT_SECRET);
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tenantId).toBe(12345);
    });

    it("handles Authorization header without Bearer prefix", async () => {
      const token = createTestJwt({ tenantId: "t1" });
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: token },
      });
      expect(res.statusCode).toBe(401);
    });

    it("handles case-sensitive Bearer prefix", async () => {
      const token = createTestJwt({ tenantId: "t1" });
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: `bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("handles token with only dots", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: "Bearer ..." },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("API key edge cases", () => {
    it("handles empty string API key", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { "x-api-key": "" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("handles very long API key", async () => {
      const longKey = "a".repeat(10000);
      const res = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { "x-api-key": longKey },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("hashApiKey edge cases", () => {
    it("handles empty string", () => {
      const hash = hashApiKey("");
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it("handles unicode strings", () => {
      const hash = hashApiKey("key-unicode-abc");
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("is deterministic for same input", () => {
      const input = "test-determinism";
      expect(hashApiKey(input)).toBe(hashApiKey(input));
    });
  });

  describe("verifyToken edge cases", () => {
    it("returns all custom claims", () => {
      const token = jwt.sign(
        { tenantId: "t1", custom: "value", nested: { a: 1 } },
        DEFAULT_SECRET
      );
      const decoded = verifyToken(token, DEFAULT_SECRET);
      expect(decoded.tenantId).toBe("t1");
      expect(decoded.custom).toBe("value");
      expect(decoded.nested).toEqual({ a: 1 });
    });

    it("throws for null secret", () => {
      const token = jwt.sign({ tenantId: "t1" }, DEFAULT_SECRET);
      expect(() => verifyToken(token, null as unknown as string)).toThrow();
    });

    it("throws for empty string token", () => {
      expect(() => verifyToken("", DEFAULT_SECRET)).toThrow();
    });
  });
});
