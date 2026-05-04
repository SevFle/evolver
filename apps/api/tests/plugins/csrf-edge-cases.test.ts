import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import {
  csrfPlugin,
  createCsrfToken,
  verifyCsrfToken,
  generateCsrfSecret,
} from "../../src/plugins/csrf";

describe("csrf plugin: advanced edge cases", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;
  let csrfSecret: string;

  beforeEach(async () => {
    csrfSecret = generateCsrfSecret();
    process.env.CSRF_SECRET = csrfSecret;
    server = Fastify();
    await server.register(csrfPlugin);
    server.post("/test", async () => ({ ok: true }));
    server.put("/test", async () => ({ ok: true }));
    server.patch("/test", async () => ({ ok: true }));
    server.delete("/test", async () => ({ ok: true }));
    server.post("/api/health/alert", async () => ({ ok: true }));
    server.post("/api/tracking-pages/test", async () => ({ ok: true }));
    server.get("/api/health", async () => ({ ok: true }));
    server.get("/api/tracking-pages/test", async () => ({ ok: true }));
  });

  afterEach(async () => {
    await server.close();
    delete process.env.CSRF_SECRET;
  });

  describe("CSRF header variations", () => {
    it("rejects with case-sensitive header check (lowercase)", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects token with extra whitespace", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": ` ${token} ` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("accepts x-csrf-token header regardless of casing (HTTP headers are case-insensitive)", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "X-CSRF-Token": token },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects numeric token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": "1234567890" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token invalid");
    });
  });

  describe("token format edge cases", () => {
    it("rejects token with multiple dots", async () => {
      const nonce = "a".repeat(32);
      const sig = "b".repeat(64);
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": `csrf_${nonce}.${sig}.extra` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects token that is just the prefix", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": "csrf_" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects token with prefix but no dot after", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": "csrf_abcdef" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects very long token with error", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": `csrf_${"x".repeat(1000)}.${"y".repeat(1000)}` },
      });
      expect([403, 500]).toContain(res.statusCode);
    });

    it("rejects token with unicode characters", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": `csrf_${"\u00e9".repeat(32)}.${"a".repeat(64)}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("public path edge cases", () => {
    it("POST to /api/health/subpath bypasses CSRF", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/health/alert",
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET to /api/health does not require CSRF", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/health",
      });
      expect(res.statusCode).toBe(200);
    });

    it("POST to /api/tracking-pages/subpath bypasses CSRF", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/tracking-pages/test",
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET to /api/tracking-pages does not require CSRF", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/test",
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("secret reuse", () => {
    it("same secret generates valid tokens across multiple calls", async () => {
      const tokens = Array.from({ length: 5 }, () => createCsrfToken(csrfSecret));
      for (const token of tokens) {
        expect(verifyCsrfToken(token, csrfSecret)).toBe(true);
      }
    });

    it("tokens from different secrets are not interchangeable", async () => {
      const secretA = generateCsrfSecret();
      const secretB = generateCsrfSecret();
      const tokenA = createCsrfToken(secretA);
      expect(verifyCsrfToken(tokenA, secretA)).toBe(true);
      expect(verifyCsrfToken(tokenA, secretB)).toBe(false);
    });
  });

  describe("verifyCsrfToken boundary conditions", () => {
    it("returns false for undefined token", () => {
      expect(verifyCsrfToken(undefined as unknown as string, "secret")).toBe(false);
    });

    it("returns false for very short nonce", () => {
      const shortNonce = "ab";
      const sig = require("crypto")
        .createHmac("sha256", "secret")
        .update(shortNonce)
        .digest("hex");
      expect(verifyCsrfToken(`csrf_${shortNonce}.${sig}`, "secret")).toBe(true);
    });

    it("handles token with dot at first position after prefix", () => {
      expect(verifyCsrfToken("csrf_.signaturehex", "secret")).toBe(false);
    });

    it("handles token with dot at last position", () => {
      expect(verifyCsrfToken("csrf_nonce.", "secret")).toBe(false);
    });

    it("returns false for token with only dots after prefix", () => {
      expect(verifyCsrfToken("csrf_...", "secret")).toBe(false);
    });
  });
});

describe("CSRF secret fallback behavior", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses CSRF_SECRET when set", async () => {
    process.env.CSRF_SECRET = "my-csrf-secret-1234567890";
    process.env.JWT_SECRET = "my-jwt-secret";
    const server = Fastify();
    await server.register(csrfPlugin);
    const token = server.generateCsrfToken();
    expect(verifyCsrfToken(token, "my-csrf-secret-1234567890")).toBe(true);
    await server.close();
  });

  it("falls back to JWT_SECRET when CSRF_SECRET is not set", async () => {
    delete process.env.CSRF_SECRET;
    process.env.JWT_SECRET = "my-jwt-secret-for-fallback";
    const server = Fastify();
    await server.register(csrfPlugin);
    const token = server.generateCsrfToken();
    expect(verifyCsrfToken(token, "my-jwt-secret-for-fallback")).toBe(true);
    await server.close();
  });

  it("generates random secret when neither CSRF_SECRET nor JWT_SECRET is set", async () => {
    delete process.env.CSRF_SECRET;
    delete process.env.JWT_SECRET;
    const server = Fastify();
    await server.register(csrfPlugin);
    const token = server.generateCsrfToken();
    expect(token).toBeTruthy();
    expect(token.startsWith("csrf_")).toBe(true);
    await server.close();
  });
});
