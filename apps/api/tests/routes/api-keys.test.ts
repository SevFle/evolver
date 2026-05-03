import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ak";
  return null;
};

describe("API Key Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/api-keys", () => {
    it("returns empty list", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/api-keys",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toEqual([]);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/api-keys",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/api-keys", () => {
    it("generates a hex key of sufficient length", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/api-keys",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      const key = res.json().data.key;
      expect(key).toBeDefined();
      expect(typeof key).toBe("string");
      expect(key.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });

    it("generates unique keys on each request", async () => {
      const headers = { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() };
      const keys = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/api/api-keys",
          headers,
        });
        keys.add(res.json().data.key);
      }
      expect(keys.size).toBe(5);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/api-keys",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/api-keys/:id", () => {
    it("revokes a key by id", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/my-key-id",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain("my-key-id");
      expect(res.json().message).toContain("revoked");
    });

    it("handles UUID-format key IDs", async () => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      const res = await server.inject({
        method: "DELETE",
        url: `/api/api-keys/${id}`,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain(id);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/api-keys/some-id",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
