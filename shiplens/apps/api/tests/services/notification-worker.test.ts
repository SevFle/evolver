import { describe, it, expect, vi, beforeEach } from "vitest";
import { processMilestoneEvent, type MilestoneEvent } from "../../src/services/notification-worker.js";
import { NotificationDispatcher, type NotificationRule } from "../../src/services/notification-dispatcher.js";
import type { EmailProvider } from "../../src/services/email-provider.js";
import type { SendEmailPayload, SendResult } from "@shiplens/types";

function createMockProvider(): EmailProvider {
  return {
    send: vi.fn(async (_payload: SendEmailPayload): Promise<SendResult> => ({
      success: true,
      messageId: "mock-msg-123",
    })),
  };
}

const baseEvent: MilestoneEvent = {
  shipmentId: "ship-001",
  tenantId: "tenant-001",
  milestoneId: "ms-001",
  status: "booked",
  trackingId: "TRACK-001",
  customerEmail: "customer@example.com",
  customerPhone: "+1234567890",
  customerName: "John Doe",
  location: "Warehouse",
  description: "Package booked",
  eventTimestamp: "2025-01-15T10:00:00Z",
  origin: "Los Angeles",
  destination: "New York",
  carrierName: "FedEx",
  tenantName: "ShipCo",
};

describe("processMilestoneEvent", () => {
  let dispatcher: NotificationDispatcher;
  let rulesLookup: ReturnType<typeof vi.fn>;
  let templateLookup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const provider = createMockProvider();
    dispatcher = new NotificationDispatcher(provider);
    rulesLookup = vi.fn();
    templateLookup = vi.fn();
  });

  it("returns empty array when no rules match", async () => {
    rulesLookup.mockResolvedValue([]);
    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);
    expect(results).toEqual([]);
    expect(rulesLookup).toHaveBeenCalledWith("tenant-001");
  });

  it("returns empty array when all matching rules are disabled", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: false },
    ];
    rulesLookup.mockResolvedValue(rules);
    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);
    expect(results).toEqual([]);
  });

  it("dispatches email for matching email rule", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("email");
    expect(results[0].recipient).toBe("customer@example.com");
    expect(results[0].success).toBe(true);
  });

  it("dispatches SMS for matching SMS rule", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "sms", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("sms");
    expect(results[0].recipient).toBe("+1234567890");
    expect(results[0].success).toBe(true);
  });

  it("dispatches both email and SMS for dual rules", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: true },
      { id: "r2", tenantId: "tenant-001", triggerStatus: "booked", channel: "sms", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(2);
    expect(results[0].channel).toBe("email");
    expect(results[1].channel).toBe("sms");
  });

  it("skips email rule when no customer email", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);

    const eventNoEmail = { ...baseEvent, customerEmail: undefined };
    const results = await processMilestoneEvent(eventNoEmail, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(0);
  });

  it("skips SMS rule when no customer phone", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "sms", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);

    const eventNoPhone = { ...baseEvent, customerPhone: undefined };
    const results = await processMilestoneEvent(eventNoPhone, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(0);
  });

  it("looks up template when rule has templateId", async () => {
    const rules: NotificationRule[] = [
      {
        id: "r1",
        tenantId: "tenant-001",
        triggerStatus: "booked",
        channel: "email",
        isEnabled: true,
        templateId: "tmpl-001",
      },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue({
      subject: "Custom {{trackingId}}",
      bodyText: "Hello {{customerName}}",
    });

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(templateLookup).toHaveBeenCalledWith("tenant-001", "tmpl-001");
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("falls back to default template when template lookup fails", async () => {
    const rules: NotificationRule[] = [
      {
        id: "r1",
        tenantId: "tenant-001",
        triggerStatus: "booked",
        channel: "email",
        isEnabled: true,
        templateId: "tmpl-001",
      },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("uses shipmentId as trackingId fallback", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const eventNoTrackingId = { ...baseEvent, trackingId: undefined };
    const results = await processMilestoneEvent(eventNoTrackingId, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(1);
  });

  it("handles multiple rules with different statuses matching only relevant ones", async () => {
    const rules: NotificationRule[] = [
      { id: "r1", tenantId: "tenant-001", triggerStatus: "booked", channel: "email", isEnabled: true },
      { id: "r2", tenantId: "tenant-001", triggerStatus: "delivered", channel: "email", isEnabled: true },
      { id: "r3", tenantId: "tenant-001", triggerStatus: "booked", channel: "sms", isEnabled: true },
    ];
    rulesLookup.mockResolvedValue(rules);
    templateLookup.mockResolvedValue(null);

    const results = await processMilestoneEvent(baseEvent, dispatcher, rulesLookup, templateLookup);

    expect(results).toHaveLength(2);
  });
});
