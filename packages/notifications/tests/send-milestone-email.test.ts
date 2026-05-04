import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMilestoneEmail } from "../src/send-milestone-email";
import { resetResendClient } from "../src/email";
import type { ShipmentEmailData } from "../src/templates/types";

vi.mock("resend", () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

async function getMockSend() {
  const mod = await import("resend");
  return (mod as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend;
}

const baseShipmentData: ShipmentEmailData = {
  trackingId: "SL-TEST-001",
  origin: "New York, NY",
  destination: "London, UK",
  customerName: "Jane Smith",
  carrier: "FedEx",
  estimatedDelivery: "2025-07-01",
};

const defaultParams = {
  to: "customer@example.com",
  from: "noreply@shiplens.io",
};

describe("sendMilestoneEmail", () => {
  beforeEach(() => {
    resetResendClient();
    process.env.RESEND_API_KEY = "re_test_key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  describe("validation", () => {
    it("rejects empty recipient email", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        to: "",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Recipient email address is required");
    });

    it("rejects whitespace-only recipient email", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        to: "   ",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Recipient email address is required");
    });

    it("rejects invalid recipient email format", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        to: "not-an-email",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid recipient email address");
    });

    it("rejects empty sender email", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        from: "",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Sender email address is required");
    });

    it("rejects invalid sender email format", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        from: "bad-format",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid sender email address");
    });

    it("rejects recipient missing @ sign", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        to: "nodomain.com",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid recipient email");
    });

    it("rejects recipient missing TLD", async () => {
      const result = await sendMilestoneEmail({
        ...defaultParams,
        to: "user@domain",
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid recipient email");
    });
  });

  describe("successful sends", () => {
    it("sends picked_up milestone email", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_picked" }, error: null });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "picked_up",
        shipmentData: baseShipmentData,
      });

      expect(result).toEqual({ success: true, messageId: "msg_picked" });
      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("picked up");
      expect(call.html).toContain("SL-TEST-001");
      expect(call.text).toContain("SL-TEST-001");
    });

    it("sends in_transit milestone email", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_transit" }, error: null });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "in_transit",
        shipmentData: baseShipmentData,
      });

      expect(result).toEqual({ success: true, messageId: "msg_transit" });
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("in transit");
    });

    it("sends delivered milestone email", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_delivered" }, error: null });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });

      expect(result).toEqual({ success: true, messageId: "msg_delivered" });
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("delivered");
    });

    it("sends exception milestone email", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_exception" }, error: null });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "exception",
        shipmentData: baseShipmentData,
      });

      expect(result).toEqual({ success: true, messageId: "msg_exception" });
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain("Attention");
    });

    it("passes all shipment data into the template", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_full" }, error: null });

      await sendMilestoneEmail({
        ...defaultParams,
        templateName: "picked_up",
        shipmentData: {
          ...baseShipmentData,
          location: "Warehouse A",
          description: "Custom desc",
        },
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("Jane Smith");
      expect(call.html).toContain("New York, NY");
      expect(call.html).toContain("London, UK");
      expect(call.html).toContain("FedEx");
      expect(call.html).toContain("Warehouse A");
    });

    it("works with minimal shipment data", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_min" }, error: null });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: {
          trackingId: "SL-MIN",
          origin: "A",
          destination: "B",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("propagates Resend rate limit errors", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({
        data: null,
        error: { name: "rate_limit_exceeded", message: "Too many requests" },
      });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Too many requests");
    });

    it("propagates Resend validation errors (invalid address)", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({
        data: null,
        error: { name: "validation_error", message: "Invalid 'to' address" },
      });

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid 'to' address");
    });

    it("handles network exceptions", async () => {
      const mockSend = await getMockSend();
      mockSend.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
    });

    it("handles missing RESEND_API_KEY gracefully", async () => {
      delete process.env.RESEND_API_KEY;
      resetResendClient();

      const result = await sendMilestoneEmail({
        ...defaultParams,
        templateName: "delivered",
        shipmentData: baseShipmentData,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("RESEND_API_KEY");
    });
  });
});
