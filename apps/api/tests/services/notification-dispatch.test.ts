import { describe, it, expect } from "vitest";
import {
  dispatchNotification,
  resolveChannel,
  buildMessage,
  getDefaultMessage,
  type NotificationPreference,
  type PreferenceResolver,
} from "../../src/services/notification-dispatch";

const makePref = (overrides: Partial<NotificationPreference> = {}): NotificationPreference => ({
  id: "pref-1",
  tenantId: "tenant-1",
  milestoneType: "delivered",
  channel: "email",
  enabled: true,
  customTemplate: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  ...overrides,
});

const allMilestones = ["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception"] as const;

describe("resolveChannel", () => {
  it("returns ['email'] for email channel", () => {
    expect(resolveChannel(makePref({ channel: "email" }))).toEqual(["email"]);
  });

  it("returns ['sms'] for sms channel", () => {
    expect(resolveChannel(makePref({ channel: "sms" }))).toEqual(["sms"]);
  });

  it("returns ['email', 'sms'] for both channel", () => {
    expect(resolveChannel(makePref({ channel: "both" }))).toEqual(["email", "sms"]);
  });

  it("defaults to email for unknown channel", () => {
    const pref = makePref({ channel: "unknown" as "email" | "sms" | "both" });
    expect(resolveChannel(pref)).toEqual(["email"]);
  });
});

describe("buildMessage", () => {
  it("returns custom template when set", () => {
    const pref = makePref({ customTemplate: "Custom: {{trackingId}}" });
    expect(buildMessage(pref, "default")).toBe("Custom: {{trackingId}}");
  });

  it("returns default message when custom template is null", () => {
    const pref = makePref({ customTemplate: null });
    expect(buildMessage(pref, "default msg")).toBe("default msg");
  });

  it("returns default message when custom template is empty string", () => {
    const pref = makePref({ customTemplate: "" });
    expect(buildMessage(pref, "default msg")).toBe("default msg");
  });

  it("returns default message when custom template is whitespace only", () => {
    const pref = makePref({ customTemplate: "   " });
    expect(buildMessage(pref, "default msg")).toBe("default msg");
  });
});

describe("getDefaultMessage", () => {
  it("returns correct message for each milestone type", () => {
    const expected: Record<string, string> = {
      created: "Your shipment has been created.",
      picked_up: "Your shipment has been picked up.",
      in_transit: "Your shipment is in transit.",
      out_for_delivery: "Your shipment is out for delivery.",
      delivered: "Your shipment has been delivered.",
      exception: "There is an issue with your shipment.",
    };
    for (const m of allMilestones) {
      expect(getDefaultMessage(m)).toBe(expected[m]);
    }
  });
});

describe("dispatchNotification", () => {
  const makeResolver =
    (prefs: NotificationPreference[]): PreferenceResolver =>
    async () =>
      prefs;

  it("dispatches when preference is enabled", async () => {
    const resolver = makeResolver([makePref({ milestoneType: "delivered", enabled: true, channel: "email" })]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "",
      },
      resolver
    );
    expect(result.sent).toBe(true);
    expect(result.channels).toEqual(["email"]);
    expect(result.message).toBe("Your shipment has been delivered.");
  });

  it("returns not sent when preference is disabled", async () => {
    const resolver = makeResolver([makePref({ milestoneType: "delivered", enabled: false })]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("returns not sent when no matching preference", async () => {
    const resolver = makeResolver([makePref({ milestoneType: "created" })]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toContain("No preference configured");
  });

  it("returns not sent when tenantId is empty", async () => {
    const resolver = makeResolver([]);
    const result = await dispatchNotification(
      {
        tenantId: "",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Missing tenantId");
  });

  it("returns not sent when recipient is empty", async () => {
    const resolver = makeResolver([makePref()]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Missing recipient");
  });

  it("returns not sent for invalid milestoneType", async () => {
    const resolver = makeResolver([]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "invalid" as "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toContain("Invalid milestoneType");
  });

  it("uses custom template when set", async () => {
    const resolver = makeResolver([
      makePref({ milestoneType: "exception", channel: "both", customTemplate: "URGENT: shipment issue" }),
    ]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "exception",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "ignored",
      },
      resolver
    );
    expect(result.sent).toBe(true);
    expect(result.channels).toEqual(["email", "sms"]);
    expect(result.message).toBe("URGENT: shipment issue");
  });

  it("dispatches for all valid milestone types", async () => {
    for (const milestone of allMilestones) {
      const resolver = makeResolver([
        makePref({ milestoneType: milestone, enabled: true, channel: "email" }),
      ]);
      const result = await dispatchNotification(
        {
          tenantId: "tenant-1",
          milestoneType: milestone,
          shipmentId: "ship-1",
          recipient: "user@example.com",
          message: "",
        },
        resolver
      );
      expect(result.sent).toBe(true);
      expect(result.channels).toEqual(["email"]);
    }
  });

  it("resolves all channels for 'both'", async () => {
    const resolver = makeResolver([makePref({ channel: "both" })]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "",
      },
      resolver
    );
    expect(result.channels).toEqual(["email", "sms"]);
  });

  it("resolves sms only for 'sms'", async () => {
    const resolver = makeResolver([makePref({ channel: "sms" })]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "",
      },
      resolver
    );
    expect(result.channels).toEqual(["sms"]);
  });

  it("handles whitespace-only tenantId", async () => {
    const resolver = makeResolver([]);
    const result = await dispatchNotification(
      {
        tenantId: "   ",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Missing tenantId");
  });

  it("handles whitespace-only recipient", async () => {
    const resolver = makeResolver([makePref()]);
    const result = await dispatchNotification(
      {
        tenantId: "tenant-1",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "   ",
        message: "test",
      },
      resolver
    );
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("Missing recipient");
  });

  it("returns empty channels and message when not sent", async () => {
    const resolver = makeResolver([]);
    const result = await dispatchNotification(
      {
        tenantId: "",
        milestoneType: "delivered",
        shipmentId: "ship-1",
        recipient: "user@example.com",
        message: "test",
      },
      resolver
    );
    expect(result.channels).toEqual([]);
    expect(result.message).toBe("");
  });
});
