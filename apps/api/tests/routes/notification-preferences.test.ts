import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-notif";
  return null;
};

describe("Notification Preferences Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/notifications/preferences", () => {
    it("returns default preferences for a tenant", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-abc"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(6);
      const types = body.data.map((p: { milestoneType: string }) => p.milestoneType);
      expect(types).toEqual(["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception"]);
    });

    it("returns preferences with correct default values", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-abc"),
      });
      const body = res.json();
      for (const pref of body.data) {
        expect(pref.channel).toBe("email");
        expect(pref.enabled).toBe(true);
        expect(pref.customTemplate).toBeNull();
        expect(pref.tenantId).toBe("tenant-abc");
      }
    });

    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with invalid bearer token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: { authorization: "Bearer invalid-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("isolates preferences between tenants", async () => {
      const resA = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-a"),
      });
      const resB = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-b"),
      });
      expect(resA.json().data[0].tenantId).toBe("tenant-a");
      expect(resB.json().data[0].tenantId).toBe("tenant-b");
    });
  });

  describe("PUT /api/notifications/preferences", () => {
    it("updates a preference for a milestone type", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: {
          milestoneType: "delivered",
          channel: "sms",
          enabled: false,
        },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.milestoneType).toBe("delivered");
      expect(body.data.channel).toBe("sms");
      expect(body.data.enabled).toBe(false);
    });

    it("persists updates across GET requests", async () => {
      await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: {
          milestoneType: "exception",
          channel: "both",
          enabled: true,
          customTemplate: "Alert: shipment {{id}} has an issue",
        },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });

      const getRes = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-abc"),
      });
      const prefs = getRes.json().data;
      const exceptionPref = prefs.find((p: { milestoneType: string }) => p.milestoneType === "exception");
      expect(exceptionPref.channel).toBe("both");
      expect(exceptionPref.enabled).toBe(true);
      expect(exceptionPref.customTemplate).toBe("Alert: shipment {{id}} has an issue");
    });

    it("returns 401 without authentication", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 without CSRF token", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered" },
        headers: authBearerHeader("tenant-abc"),
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 400 when body is missing", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Request body is required");
    });

    it("returns 400 for invalid milestoneType", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "invalid_type" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Invalid milestoneType");
    });

    it("returns 400 for invalid channel", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", channel: "carrier_pigeon" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Invalid channel");
    });

    it("returns 400 when enabled is not a boolean", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", enabled: "yes" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("enabled must be a boolean");
    });

    it("returns 400 when customTemplate is not a string or null", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", customTemplate: 12345 },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("customTemplate must be a string or null");
    });

    it("accepts customTemplate as null", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", customTemplate: null },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.customTemplate).toBeNull();
    });

    it("accepts customTemplate as a string", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", customTemplate: "Your package has arrived!" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.customTemplate).toBe("Your package has arrived!");
    });

    it("accepts partial updates (only channel)", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "in_transit", channel: "both" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.channel).toBe("both");
      expect(res.json().data.enabled).toBe(true);
    });

    it("accepts partial updates (only enabled)", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "picked_up", enabled: false },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enabled).toBe(false);
      expect(res.json().data.channel).toBe("email");
    });

    it("does not leak updates across tenants", async () => {
      await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "delivered", channel: "sms", enabled: false },
        headers: {
          ...authBearerHeader("tenant-x"),
          "x-csrf-token": createCsrfToken(),
        },
      });

      const otherRes = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-y"),
      });
      const prefs = otherRes.json().data;
      const delivered = prefs.find((p: { milestoneType: string }) => p.milestoneType === "delivered");
      expect(delivered.channel).toBe("email");
      expect(delivered.enabled).toBe(true);
    });

    it("updates updatedAt timestamp on modification", async () => {
      const getBefore = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: authBearerHeader("tenant-abc"),
      });
      const beforeUpdated = getBefore.json().data[0].updatedAt;

      const putRes = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: { milestoneType: "created", channel: "both" },
        headers: {
          ...authBearerHeader("tenant-abc"),
          "x-csrf-token": createCsrfToken(),
        },
      });
      expect(putRes.json().data.updatedAt).not.toBe(beforeUpdated);
    });
  });

  describe("Existing notification routes (unchanged)", () => {
    it("GET /rules returns empty list", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/rules",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it("POST /rules creates a rule", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { milestoneType: "delivered", channel: "email" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
    });

    it("GET /history returns empty list", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });
  });
});
