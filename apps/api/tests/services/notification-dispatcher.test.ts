import { describe, it, expect, beforeEach } from "vitest";
import { NotificationDispatcher } from "../../src/services/notification-dispatcher";
import type { NotificationStore, NotificationRecord } from "../../src/services/notification-dispatcher";
import type { EmailService, EmailResult } from "../../src/services/email";
import type { MilestoneType } from "@shiplens/shared";
import { InMemoryNotificationStore } from "../../src/services/in-memory-store";

describe("NotificationDispatcher", () => {
  let store: InMemoryNotificationStore;
  let sentEmails: Array<{ to: string; subject: string; html: string }>;
  let emailResults: Array<EmailResult>;
  let emailService: EmailService;
  let dispatcher: NotificationDispatcher;

  const TENANT_ID = "tenant-1";
  const SHIPMENT_ID = "ship-1";

  beforeEach(() => {
    store = new InMemoryNotificationStore();
    sentEmails = [];
    emailResults = [];

    emailService = {
      getDefaultFrom: () => "test@shiplens.app",
      send: async (msg) => {
        sentEmails.push({ to: msg.to, subject: msg.subject ?? "", html: msg.html });
        const result = emailResults.shift() ?? { success: true, messageId: "mock-id" };
        return result;
      },
    } as unknown as EmailService;

    dispatcher = new NotificationDispatcher(emailService, store, "https://track.test.com");

    store.seedShipment({
      id: SHIPMENT_ID,
      tenantId: TENANT_ID,
      trackingId: "SL-TEST001",
      origin: "Shanghai",
      destination: "Los Angeles",
      carrier: "Maersk",
      customerName: "John Doe",
      customerEmail: "john@example.com",
      customerPhone: "+1234567890",
    });
  });

  describe("dispatchForMilestone", () => {
    it("returns empty when shipment not found", async () => {
      const result = await dispatcher.dispatchForMilestone("nonexistent", {
        id: "ms-1",
        shipmentId: "nonexistent",
        type: "delivered",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(0);
      expect(result.errors).toContain("Shipment not found");
    });

    it("returns empty when no matching rules", async () => {
      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "delivered",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("sends email notification when rule matches", async () => {
      store.seedRule({
        id: "rule-1",
        tenantId: TENANT_ID,
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      emailResults.push({ success: true, messageId: "sent-1" });

      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "delivered",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].status).toBe("sent");
      expect(result.notifications[0].providerId).toBe("sent-1");
      expect(result.notifications[0].recipient).toBe("john@example.com");
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe("john@example.com");
      expect(sentEmails[0].subject).toContain("SL-TEST001");
    });

    it("handles email send failure", async () => {
      store.seedRule({
        id: "rule-1",
        tenantId: TENANT_ID,
        milestoneType: "exception",
        channel: "email",
        enabled: true,
      });

      emailResults.push({ success: false, error: "SMTP timeout" });

      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "exception",
        description: "Customs delay",
        location: "Port of LA",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].status).toBe("failed");
      expect(result.notifications[0].errorMessage).toBe("SMTP timeout");
      expect(result.notifications[0].retryCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("skips disabled rules", async () => {
      store.seedRule({
        id: "rule-1",
        tenantId: TENANT_ID,
        milestoneType: "delivered",
        channel: "email",
        enabled: false,
      });

      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "delivered",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(0);
      expect(sentEmails).toHaveLength(0);
    });

    it("skips when no customer email and channel is email", async () => {
      store.seedShipment({
        id: "ship-no-email",
        tenantId: TENANT_ID,
        trackingId: "SL-NOEMAIL",
        customerEmail: undefined,
      });

      store.seedRule({
        id: "rule-1",
        tenantId: TENANT_ID,
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const result = await dispatcher.dispatchForMilestone("ship-no-email", {
        id: "ms-1",
        shipmentId: "ship-no-email",
        type: "delivered",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(0);
      expect(result.errors[0]).toContain("No recipient");
    });

    it("uses custom subject and body templates from rule", async () => {
      store.seedRule({
        id: "rule-custom",
        tenantId: TENANT_ID,
        milestoneType: "picked_up",
        channel: "email",
        subjectTemplate: "Custom: {{trackingId}} picked up!",
        bodyTemplate: "<h1>{{customerName}}, your package is on the way from {{origin}}</h1>",
        enabled: true,
      });

      emailResults.push({ success: true, messageId: "sent-custom" });

      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "picked_up",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(1);
      expect(sentEmails[0].subject).toBe("Custom: SL-TEST001 picked up!");
      expect(sentEmails[0].html).toContain("John Doe");
      expect(sentEmails[0].html).toContain("Shanghai");
    });

    it("passes tenant info for branded templates", async () => {
      store.seedRule({
        id: "rule-1",
        tenantId: TENANT_ID,
        milestoneType: "booked",
        channel: "email",
        enabled: true,
      });

      emailResults.push({ success: true, messageId: "sent-branded" });

      await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "booked",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID, { name: "Acme Corp", primaryColor: "#FF0000", slug: "acme" });

      expect(sentEmails[0].html).toContain("Acme Corp");
      expect(sentEmails[0].html).toContain("https://track.test.com/acme/SL-TEST001");
    });

    it("processes multiple matching rules", async () => {
      store.seedRule({
        id: "rule-email",
        tenantId: TENANT_ID,
        milestoneType: "in_transit",
        channel: "email",
        enabled: true,
      });
      store.seedRule({
        id: "rule-both",
        tenantId: TENANT_ID,
        milestoneType: "in_transit",
        channel: "both",
        enabled: true,
      });

      emailResults.push(
        { success: true, messageId: "sent-1" },
        { success: true, messageId: "sent-2" }
      );

      const result = await dispatcher.dispatchForMilestone(SHIPMENT_ID, {
        id: "ms-1",
        shipmentId: SHIPMENT_ID,
        type: "in_transit",
        location: "Pacific Ocean",
        occurredAt: new Date().toISOString(),
      }, TENANT_ID);

      expect(result.notifications).toHaveLength(2);
      expect(sentEmails).toHaveLength(2);
    });
  });

  describe("resend", () => {
    it("returns error when notification not found", async () => {
      const result = await dispatcher.resend("nonexistent", TENANT_ID);
      expect(result.errors).toContain("Notification not found");
    });

    it("resends a previously failed email notification", async () => {
      const notif = await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test Subject",
        bodySent: "<p>Test Body</p>",
        status: "failed",
        retryCount: 2,
        errorMessage: "Previous error",
      });

      emailResults.push({ success: true, messageId: "resent-1" });

      const result = await dispatcher.resend(notif.id, TENANT_ID);

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].status).toBe("sent");
      expect(result.notifications[0].providerId).toBe("resent-1");
      expect(result.notifications[0].retryCount).toBe(3);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe("john@example.com");
    });

    it("handles resend failure", async () => {
      const notif = await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test Subject",
        bodySent: "<p>Test Body</p>",
        status: "failed",
        retryCount: 1,
      });

      emailResults.push({ success: false, error: "Rate limited" });

      const result = await dispatcher.resend(notif.id, TENANT_ID);

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].status).toBe("failed");
      expect(result.notifications[0].errorMessage).toBe("Rate limited");
      expect(result.notifications[0].retryCount).toBe(2);
    });

    it("rejects resend for non-email channel", async () => {
      const notif = await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "sms",
        recipient: "+1234567890",
        subject: undefined as unknown as string,
        bodySent: "",
        status: "pending",
        retryCount: 0,
      });

      const result = await dispatcher.resend(notif.id, TENANT_ID);
      expect(result.errors[0]).toContain("Resend only supported for email");
    });

    it("rejects resend from different tenant", async () => {
      const notif = await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test",
        bodySent: "<p>Hi</p>",
        status: "sent",
        retryCount: 0,
      });

      const result = await dispatcher.resend(notif.id, "other-tenant");
      expect(result.errors).toContain("Notification not found");
    });
  });

  describe("getHistory", () => {
    it("returns empty list for tenant with no notifications", async () => {
      const result = await dispatcher.getHistory(TENANT_ID);
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("returns notifications for tenant", async () => {
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test 1",
        bodySent: "<p>1</p>",
        status: "sent",
        retryCount: 0,
      });
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test 2",
        bodySent: "<p>2</p>",
        status: "pending",
        retryCount: 0,
      });

      const result = await dispatcher.getHistory(TENANT_ID);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by shipmentId", async () => {
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test",
        bodySent: "<p>1</p>",
        status: "sent",
        retryCount: 0,
      });
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: "ship-other",
        channel: "email",
        recipient: "john@example.com",
        subject: "Test",
        bodySent: "<p>2</p>",
        status: "sent",
        retryCount: 0,
      });

      const result = await dispatcher.getHistory(TENANT_ID, { shipmentId: SHIPMENT_ID });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("filters by status", async () => {
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test",
        bodySent: "<p>1</p>",
        status: "sent",
        retryCount: 0,
      });
      await store.insertNotification({
        tenantId: TENANT_ID,
        shipmentId: SHIPMENT_ID,
        channel: "email",
        recipient: "john@example.com",
        subject: "Test",
        bodySent: "<p>2</p>",
        status: "failed",
        retryCount: 0,
      });

      const result = await dispatcher.getHistory(TENANT_ID, { status: "failed" });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("paginates results", async () => {
      for (let i = 0; i < 5; i++) {
        await store.insertNotification({
          tenantId: TENANT_ID,
          shipmentId: SHIPMENT_ID,
          channel: "email",
          recipient: "john@example.com",
          subject: `Test ${i}`,
          bodySent: `<p>${i}</p>`,
          status: "sent",
          retryCount: 0,
        });
      }

      const page1 = await dispatcher.getHistory(TENANT_ID, { limit: 2, offset: 0 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await dispatcher.getHistory(TENANT_ID, { limit: 2, offset: 2 });
      expect(page2.data).toHaveLength(2);

      const page3 = await dispatcher.getHistory(TENANT_ID, { limit: 2, offset: 4 });
      expect(page3.data).toHaveLength(1);
    });
  });
});
