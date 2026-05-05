import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationDispatcher, type NotificationRule } from "../../src/services/notification-dispatcher.js";
import type { EmailProvider } from "../../src/services/email-provider.js";
import type { SendEmailPayload, SendResult } from "@shiplens/types";

function createMockEmailProvider(sendResult?: Partial<SendResult>): EmailProvider {
  return {
    send: vi.fn(async (_payload: SendEmailPayload): Promise<SendResult> => ({
      success: true,
      messageId: "mock-msg-123",
      ...sendResult,
    })),
  };
}

describe("NotificationDispatcher", () => {
  let dispatcher: NotificationDispatcher;
  let mockProvider: EmailProvider;

  beforeEach(() => {
    mockProvider = createMockEmailProvider();
    dispatcher = new NotificationDispatcher(mockProvider);
  });

  describe("dispatch", () => {
    const baseRequest = {
      shipmentId: "ship-001",
      tenantId: "tenant-001",
      milestoneStatus: "booked" as const,
      channel: "email" as const,
      recipient: "user@example.com",
      templateVariables: {
        trackingId: "TRACK-001",
        status: "booked",
        milestoneType: "booked" as const,
      },
    };

    it("dispatches email successfully", async () => {
      const result = await dispatcher.dispatch(baseRequest);
      expect(result.success).toBe(true);
      expect(result.channel).toBe("email");
      expect(result.recipient).toBe("user@example.com");
      expect(result.sendResult?.success).toBe(true);
    });

    it("uses provided template data", async () => {
      const result = await dispatcher.dispatch({
        ...baseRequest,
        templateData: {
          subject: "Custom Subject {{trackingId}}",
          bodyText: "Hello {{customerName}}",
          bodyHtml: "<p>Hello {{customerName}}</p>",
        },
      });
      expect(result.success).toBe(true);
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Custom Subject TRACK-001",
        }),
      );
    });

    it("uses default template when no template data provided", async () => {
      const result = await dispatcher.dispatch(baseRequest);
      expect(result.success).toBe(true);
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("TRACK-001"),
        }),
      );
    });

    it("returns error when recipient is empty", async () => {
      const result = await dispatcher.dispatch({ ...baseRequest, recipient: "" });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Recipient is required");
    });

    it("returns error when email provider fails", async () => {
      const failProvider = createMockEmailProvider({
        success: false,
        error: "SMTP connection refused",
      });
      const failDispatcher = new NotificationDispatcher(failProvider);
      const result = await failDispatcher.dispatch(baseRequest);
      expect(result.success).toBe(false);
      expect(result.error).toBe("SMTP connection refused");
    });

    it("dispatches SMS with bodyText", async () => {
      const result = await dispatcher.dispatch({
        ...baseRequest,
        channel: "sms",
        recipient: "+1234567890",
      });
      expect(result.success).toBe(true);
      expect(result.channel).toBe("sms");
    });

    it("returns error for SMS with empty body", async () => {
      const result = await dispatcher.dispatch({
        ...baseRequest,
        channel: "sms",
        recipient: "+1234567890",
        templateData: {
          subject: "Test",
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("SMS body is empty");
    });

    it("returns error for unsupported channel", async () => {
      const result = await dispatcher.dispatch({
        ...baseRequest,
        channel: "push" as any,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported channel");
    });

    it("uses custom fromEmail when provided", async () => {
      await dispatcher.dispatch({
        ...baseRequest,
        fromEmail: "custom@tenant.com",
      });
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({ from: "custom@tenant.com" }),
      );
    });

    it("falls back to default fromEmail", async () => {
      await dispatcher.dispatch(baseRequest);
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({ from: "notifications@shiplens.app" }),
      );
    });
  });

  describe("findMatchingRules", () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "t1", triggerStatus: "booked", channel: "email", isEnabled: true },
      { id: "r2", tenantId: "t1", triggerStatus: "booked", channel: "sms", isEnabled: true },
      { id: "r3", tenantId: "t1", triggerStatus: "delivered", channel: "email", isEnabled: true },
      { id: "r4", tenantId: "t1", triggerStatus: "booked", channel: "email", isEnabled: false },
      { id: "r5", tenantId: "t1", triggerStatus: "exception", channel: "sms", isEnabled: true },
    ];

    it("returns matching enabled rules", () => {
      const result = dispatcher.findMatchingRules(rules, "booked");
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.triggerStatus === "booked" && r.isEnabled)).toBe(true);
    });

    it("excludes disabled rules", () => {
      const result = dispatcher.findMatchingRules(rules, "booked");
      expect(result.every((r) => r.isEnabled)).toBe(true);
    });

    it("returns empty array when no rules match", () => {
      const result = dispatcher.findMatchingRules(rules, "at_port");
      expect(result).toHaveLength(0);
    });

    it("returns empty array for empty rules", () => {
      const result = dispatcher.findMatchingRules([], "booked");
      expect(result).toHaveLength(0);
    });

    it("matches delivered rules", () => {
      const result = dispatcher.findMatchingRules(rules, "delivered");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("r3");
    });

    it("matches exception rules", () => {
      const result = dispatcher.findMatchingRules(rules, "exception");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("r5");
    });
  });

  describe("buildTemplateVariables", () => {
    it("builds variables from shipment data", () => {
      const vars = dispatcher.buildTemplateVariables({
        trackingId: "TRACK-001",
        customerName: "Jane",
        status: "in_transit",
        location: "Chicago",
        description: "In transit",
        eventTimestamp: "2025-01-15T10:00:00Z",
        origin: "LA",
        destination: "NYC",
        carrierName: "FedEx",
        estimatedDelivery: "2025-01-20",
        tenantName: "ShipCo",
      });

      expect(vars.trackingId).toBe("TRACK-001");
      expect(vars.customerName).toBe("Jane");
      expect(vars.status).toBe("in_transit");
      expect(vars.milestoneType).toBe("in_transit");
      expect(vars.location).toBe("Chicago");
      expect(vars.origin).toBe("LA");
      expect(vars.destination).toBe("NYC");
    });

    it("uses defaults for optional fields", () => {
      const vars = dispatcher.buildTemplateVariables({
        trackingId: "TRACK-001",
        status: "booked",
      });
      expect(vars.customerName).toBeUndefined();
      expect(vars.location).toBeUndefined();
    });
  });
});
