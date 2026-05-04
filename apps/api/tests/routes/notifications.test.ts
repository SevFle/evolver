import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-notif";
  return null;
};

vi.mock("@shiplens/notifications", () => ({
  sendMilestoneEmail: vi.fn(),
}));

describe("Notification Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
    vi.restoreAllMocks();
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

  describe("POST /api/notifications/send", () => {
    const validPayload = {
      milestoneType: "delivered",
      trackingId: "SL-TEST-001",
      origin: "New York, NY",
      destination: "London, UK",
      customerEmail: "customer@example.com",
      customerName: "Jane Smith",
      carrier: "FedEx",
    };

    async function getMock() {
      const mod = await import("@shiplens/notifications");
      return vi.mocked(mod.sendMilestoneEmail);
    }

    it("sends notification and returns 200", async () => {
      const mockSend = await getMock();
      mockSend.mockResolvedValue({ success: true, messageId: "msg_123" });

      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: validPayload,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.messageId).toBe("msg_123");
      expect(body.message).toBe("Notification sent");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "delivered",
          to: "customer@example.com",
          from: "notifications@shiplens.io",
        })
      );
    });

    it("uses NOTIFICATION_FROM_EMAIL env when set", async () => {
      process.env.NOTIFICATION_FROM_EMAIL = "custom@shiplens.io";
      const mockSend = await getMock();
      mockSend.mockResolvedValue({ success: true, messageId: "msg_456" });

      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: validPayload,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(200);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: "custom@shiplens.io" })
      );
      delete process.env.NOTIFICATION_FROM_EMAIL;
    });

    it("returns 400 for invalid milestoneType", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: { ...validPayload, milestoneType: "invalid_type" },
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Invalid milestoneType");
    });

    it("returns 400 when trackingId is missing", async () => {
      const { trackingId, ...noTracking } = validPayload;
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: noTracking,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("trackingId");
    });

    it("returns 400 when origin is missing", async () => {
      const { origin, ...noOrigin } = validPayload;
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: noOrigin,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("origin");
    });

    it("returns 400 when destination is missing", async () => {
      const { destination, ...noDest } = validPayload;
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: noDest,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("destination");
    });

    it("returns 400 when customerEmail is missing", async () => {
      const { customerEmail, ...noEmail } = validPayload;
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: noEmail,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("customerEmail");
    });

    it("returns 502 when sendMilestoneEmail fails", async () => {
      const mockSend = await getMock();
      mockSend.mockResolvedValue({ success: false, error: "Rate limit exceeded" });

      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: validPayload,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().error).toBe("Rate limit exceeded");
      expect(res.json().message).toBe("Failed to send notification email");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it("accepts all valid milestone types", async () => {
      const mockSend = await getMock();
      mockSend.mockResolvedValue({ success: true, messageId: "msg_ok" });

      for (const type of ["picked_up", "in_transit", "delivered", "exception"]) {
        const res = await server.inject({
          method: "POST",
          url: "/api/notifications/send",
          payload: { ...validPayload, milestoneType: type },
          headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
        });

        expect(res.statusCode).toBe(200);
      }
    });

    it("passes optional fields to sendMilestoneEmail", async () => {
      const mockSend = await getMock();
      mockSend.mockResolvedValue({ success: true, messageId: "msg_full" });

      const fullPayload = {
        ...validPayload,
        carrier: "DHL",
        customerName: "Bob",
        estimatedDelivery: "2025-08-01",
        location: "Warehouse Z",
        description: "Handoff complete",
        occurredAt: "2025-05-01T10:00:00Z",
      };

      await server.inject({
        method: "POST",
        url: "/api/notifications/send",
        payload: fullPayload,
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });

      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.shipmentData.carrier).toBe("DHL");
      expect(callArg.shipmentData.customerName).toBe("Bob");
      expect(callArg.shipmentData.estimatedDelivery).toBe("2025-08-01");
      expect(callArg.shipmentData.location).toBe("Warehouse Z");
      expect(callArg.shipmentData.description).toBe("Handoff complete");
      expect(callArg.shipmentData.occurredAt).toBe("2025-05-01T10:00:00Z");
    });
  });
});
