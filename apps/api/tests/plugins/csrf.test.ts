import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import {
  csrfPlugin,
  createCsrfToken,
  verifyCsrfToken,
  generateCsrfSecret,
} from "../../src/plugins/csrf";

describe("csrf plugin", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;
  let csrfSecret: string;

  beforeEach(async () => {
    csrfSecret = generateCsrfSecret();
    process.env.CSRF_SECRET = csrfSecret;
    server = Fastify();
    await server.register(csrfPlugin);
    server.get("/test", async () => ({ ok: true }));
    server.post("/test", async () => ({ ok: true }));
    server.patch("/test", async () => ({ ok: true }));
    server.delete("/test", async () => ({ ok: true }));
    server.put("/test", async () => ({ ok: true }));
    server.get("/api/health", async () => ({ ok: true }));
    server.post("/api/health/alert", async () => ({ ok: true }));
    server.get("/api/tracking-pages/test", async () => ({ ok: true }));
    server.post("/api/tracking-pages/test", async () => ({ ok: true }));
  });

  afterEach(async () => {
    await server.close();
    delete process.env.CSRF_SECRET;
  });

  describe("safe methods skip CSRF validation", () => {
    it("GET requests do not require CSRF token", async () => {
      const res = await server.inject({ method: "GET", url: "/test" });
      expect(res.statusCode).toBe(200);
    });

    it("HEAD requests do not require CSRF token", async () => {
      const res = await server.inject({ method: "HEAD", url: "/test" });
      expect(res.statusCode).toBe(200);
    });

    it("OPTIONS requests do not require CSRF token", async () => {
      server.options("/test", async () => ({ ok: true }));
      const res = await server.inject({ method: "OPTIONS", url: "/test" });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("state-changing methods require CSRF token", () => {
    it("POST rejects without CSRF token", async () => {
      const res = await server.inject({ method: "POST", url: "/test" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
      expect(res.json().success).toBe(false);
    });

    it("PUT rejects without CSRF token", async () => {
      const res = await server.inject({ method: "PUT", url: "/test" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });

    it("PATCH rejects without CSRF token", async () => {
      const res = await server.inject({ method: "PATCH", url: "/test" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });

    it("DELETE rejects without CSRF token", async () => {
      const res = await server.inject({ method: "DELETE", url: "/test" });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });
  });

  describe("valid CSRF token passes validation", () => {
    it("POST accepts with valid CSRF token", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(200);
    });

    it("PUT accepts with valid CSRF token", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "PUT",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(200);
    });

    it("PATCH accepts with valid CSRF token", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "PATCH",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(200);
    });

    it("DELETE accepts with valid CSRF token", async () => {
      const token = createCsrfToken(csrfSecret);
      const res = await server.inject({
        method: "DELETE",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("invalid CSRF tokens are rejected", () => {
    it("rejects with wrong secret token", async () => {
      const token = createCsrfToken("wrong-secret-1234567890");
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": token },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token invalid");
    });

    it("rejects garbage token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": "garbage-token-value" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token invalid");
    });

    it("rejects empty CSRF token header", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/test",
        headers: { "x-csrf-token": "" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("CSRF token missing");
    });
  });

  describe("public routes bypass CSRF validation", () => {
    it("POST to /api/health does not require CSRF", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/health/alert",
      });
      expect(res.statusCode).toBe(200);
    });

    it("POST to /api/tracking-pages does not require CSRF", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/tracking-pages/test",
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("server.generateCsrfToken", () => {
    it("decorates fastify with generateCsrfToken method", () => {
      expect(typeof server.generateCsrfToken).toBe("function");
    });

    it("generates a valid CSRF token", () => {
      const token = server.generateCsrfToken();
      expect(token).toBeTruthy();
      expect(verifyCsrfToken(token, csrfSecret)).toBe(true);
    });

    it("generates unique tokens on each call", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(server.generateCsrfToken());
      }
      expect(tokens.size).toBe(10);
    });
  });

  describe("multiple concurrent CSRF-validated requests", () => {
    it("handles concurrent POST requests with same CSRF token", async () => {
      const token = createCsrfToken(csrfSecret);
      const requests = Array.from({ length: 5 }, () =>
        server.inject({
          method: "POST",
          url: "/test",
          headers: { "x-csrf-token": token },
        })
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        expect(res.statusCode).toBe(200);
      }
    });
  });
});

describe("createCsrfToken utility", () => {
  it("produces tokens starting with csrf_ prefix", () => {
    const token = createCsrfToken("secret");
    expect(token.startsWith("csrf_")).toBe(true);
  });

  it("produces tokens with nonce.signature format", () => {
    const token = createCsrfToken("secret");
    const payload = token.slice(5);
    const parts = payload.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(32);
    expect(parts[1].length).toBe(64);
  });
});

describe("verifyCsrfToken utility", () => {
  it("returns true for valid token", () => {
    const secret = "test-secret";
    const token = createCsrfToken(secret);
    expect(verifyCsrfToken(token, secret)).toBe(true);
  });

  it("returns false for token with wrong secret", () => {
    const token = createCsrfToken("secret-a");
    expect(verifyCsrfToken(token, "secret-b")).toBe(false);
  });

  it("returns false for empty token", () => {
    expect(verifyCsrfToken("", "secret")).toBe(false);
  });

  it("returns false for null token", () => {
    expect(verifyCsrfToken(null as unknown as string, "secret")).toBe(false);
  });

  it("returns false for token without prefix", () => {
    expect(verifyCsrfToken("abc.def", "secret")).toBe(false);
  });

  it("returns false for token with only prefix", () => {
    expect(verifyCsrfToken("csrf_", "secret")).toBe(false);
  });

  it("returns false for token with no dot", () => {
    expect(verifyCsrfToken("csrf_abc", "secret")).toBe(false);
  });

  it("returns false for token with empty nonce", () => {
    expect(verifyCsrfToken("csrf_.def", "secret")).toBe(false);
  });

  it("returns false for token with empty signature", () => {
    expect(verifyCsrfToken("csrf_abc.", "secret")).toBe(false);
  });

  it("returns false for tampered nonce", () => {
    const secret = "my-secret";
    const token = createCsrfToken(secret);
    const payload = token.slice(5);
    const dotIdx = payload.indexOf(".");
    const nonce = payload.slice(0, dotIdx);
    const sig = payload.slice(dotIdx + 1);
    const tamperedNonce = "x".repeat(nonce.length);
    expect(verifyCsrfToken(`csrf_${tamperedNonce}.${sig}`, secret)).toBe(false);
  });

  it("returns false for tampered signature", () => {
    const secret = "my-secret";
    const token = createCsrfToken(secret);
    const payload = token.slice(5);
    const dotIdx = payload.indexOf(".");
    const nonce = payload.slice(0, dotIdx);
    const tamperedSig = "f".repeat(64);
    expect(verifyCsrfToken(`csrf_${nonce}.${tamperedSig}`, secret)).toBe(false);
  });
});

describe("generateCsrfSecret utility", () => {
  it("produces a hex string of 64 characters", () => {
    const secret = generateCsrfSecret();
    expect(secret).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
  });

  it("produces unique secrets on each call", () => {
    const secrets = new Set<string>();
    for (let i = 0; i < 10; i++) {
      secrets.add(generateCsrfSecret());
    }
    expect(secrets.size).toBe(10);
  });
});
