import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-notif";
  return null;
};

describe("Notification Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/notifications/rules", () => {
    it("returns empty rules list", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/rules",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toEqual([]);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/rules",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/notifications/rules", () => {
    it("creates a notification rule", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { milestoneType: "delivered", channel: "email" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().message).toBe("Notification rule created");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/notifications/history", () => {
    it("returns empty history list", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toEqual([]);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
