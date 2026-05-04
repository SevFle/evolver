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
      expect(res.json().data.milestoneType).toBe("delivered");
      expect(res.json().data.channel).toBe("email");
      expect(res.json().data.id).toBeDefined();
    });

    it("creates a rule with defaults when optional fields omitted", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { milestoneType: "exception" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.channel).toBe("email");
      expect(res.json().data.enabled).toBe(true);
    });

    it("creates a rule with custom templates", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: {
          milestoneType: "picked_up",
          channel: "email",
          subjectTemplate: "Custom: {{trackingId}}",
          bodyTemplate: "<h1>Hi {{customerName}}</h1>",
          enabled: false,
        },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.subjectTemplate).toBe("Custom: {{trackingId}}");
      expect(res.json().data.bodyTemplate).toBe("<h1>Hi {{customerName}}</h1>");
      expect(res.json().data.enabled).toBe(false);
    });

    it("returns 400 when milestoneType is missing", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { channel: "email" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("milestoneType is required");
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

  describe("PUT /api/notifications/rules/:id", () => {
    it("updates an existing rule", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { milestoneType: "delivered", channel: "email" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      const ruleId = createRes.json().data.id;

      const res = await server.inject({
        method: "PUT",
        url: `/api/notifications/rules/${ruleId}`,
        payload: { channel: "sms", enabled: false },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe("Notification rule updated");
      expect(res.json().data.channel).toBe("sms");
      expect(res.json().data.enabled).toBe(false);
    });

    it("returns 404 for non-existent rule", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/rules/nonexistent-id",
        payload: { enabled: true },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Rule not found");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/rules/some-id",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/notifications/rules/:id", () => {
    it("deletes an existing rule", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: { milestoneType: "delivered", channel: "email" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      const ruleId = createRes.json().data.id;

      const res = await server.inject({
        method: "DELETE",
        url: `/api/notifications/rules/${ruleId}`,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe("Notification rule deleted");
    });

    it("returns 404 for non-existent rule", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/notifications/rules/nonexistent-id",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Rule not found");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/api/notifications/rules/some-id",
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
      expect(res.json().total).toBe(0);
    });

    it("returns history with pagination params", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history?limit=10&offset=0",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().limit).toBe(10);
      expect(res.json().offset).toBe(0);
    });

    it("returns history with shipment filter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history?shipmentId=ship-1",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns history with status filter", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history?status=sent",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("clamps limit to 100 max", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history?limit=999",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().limit).toBe(100);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/history",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/notifications/:id/resend", () => {
    it("returns 400 for non-existent notification", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/nonexistent-id/resend",
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Notification not found");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/some-id/resend",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
