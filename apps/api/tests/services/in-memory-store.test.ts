import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryNotificationStore } from "../../src/services/in-memory-store";

describe("InMemoryNotificationStore", () => {
  let store: InMemoryNotificationStore;

  beforeEach(() => {
    store = new InMemoryNotificationStore();
  });

  describe("findRulesForMilestone", () => {
    it("returns empty array when no rules exist", async () => {
      const rules = await store.findRulesForMilestone("t1", "delivered" as const);
      expect(rules).toEqual([]);
    });

    it("returns rules matching tenant and milestone type", async () => {
      await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });
      await store.createRule({
        tenantId: "t1",
        milestoneType: "exception",
        channel: "email",
        enabled: true,
      });
      await store.createRule({
        tenantId: "t2",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const rules = await store.findRulesForMilestone("t1", "delivered");
      expect(rules).toHaveLength(1);
      expect(rules[0].milestoneType).toBe("delivered");
    });

    it("returns all tenant rules when milestone type is empty", async () => {
      await store.createRule({ tenantId: "t1", milestoneType: "delivered", channel: "email", enabled: true });
      await store.createRule({ tenantId: "t1", milestoneType: "exception", channel: "sms", enabled: true });

      const rules = await store.findRulesForMilestone("t1", "" as never);
      expect(rules).toHaveLength(2);
    });
  });

  describe("findShipment", () => {
    it("returns null for non-existent shipment", async () => {
      const shipment = await store.findShipment("s1", "t1");
      expect(shipment).toBeNull();
    });

    it("returns shipment matching tenant", async () => {
      store.seedShipment({ id: "s1", tenantId: "t1", trackingId: "SL-1", customerEmail: "a@b.com" });
      const shipment = await store.findShipment("s1", "t1");
      expect(shipment).not.toBeNull();
      expect(shipment!.trackingId).toBe("SL-1");
    });

    it("returns null for wrong tenant", async () => {
      store.seedShipment({ id: "s1", tenantId: "t1", trackingId: "SL-1" });
      const shipment = await store.findShipment("s1", "t2");
      expect(shipment).toBeNull();
    });
  });

  describe("insertNotification and findNotification", () => {
    it("creates and retrieves notification", async () => {
      const notification = await store.insertNotification({
        tenantId: "t1",
        shipmentId: "s1",
        channel: "email",
        recipient: "test@example.com",
        subject: "Test",
        bodySent: "<p>Hi</p>",
        status: "pending",
        retryCount: 0,
      });

      expect(notification.id).toBeDefined();
      expect(notification.createdAt).toBeDefined();

      const found = await store.findNotification(notification.id, "t1");
      expect(found).not.toBeNull();
      expect(found!.recipient).toBe("test@example.com");
    });

    it("returns null for wrong tenant", async () => {
      const notification = await store.insertNotification({
        tenantId: "t1",
        shipmentId: "s1",
        channel: "email",
        recipient: "test@example.com",
        subject: "Test",
        bodySent: "<p>Hi</p>",
        status: "pending",
        retryCount: 0,
      });

      const found = await store.findNotification(notification.id, "t2");
      expect(found).toBeNull();
    });
  });

  describe("updateNotification", () => {
    it("updates notification fields", async () => {
      const notification = await store.insertNotification({
        tenantId: "t1",
        shipmentId: "s1",
        channel: "email",
        recipient: "test@example.com",
        subject: "Test",
        bodySent: "<p>Hi</p>",
        status: "pending",
        retryCount: 0,
      });

      const updated = await store.updateNotification(notification.id, {
        status: "sent",
        providerId: "provider-1",
        sentAt: new Date().toISOString(),
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("sent");
      expect(updated!.providerId).toBe("provider-1");
    });

    it("returns null for non-existent notification", async () => {
      const result = await store.updateNotification("nonexistent", { status: "sent" });
      expect(result).toBeNull();
    });
  });

  describe("listNotifications", () => {
    beforeEach(async () => {
      await store.insertNotification({
        tenantId: "t1",
        shipmentId: "s1",
        channel: "email",
        recipient: "a@test.com",
        subject: "Test 1",
        bodySent: "<p>1</p>",
        status: "sent",
        retryCount: 0,
      });
      await store.insertNotification({
        tenantId: "t1",
        shipmentId: "s2",
        channel: "email",
        recipient: "b@test.com",
        subject: "Test 2",
        bodySent: "<p>2</p>",
        status: "failed",
        retryCount: 1,
      });
      await store.insertNotification({
        tenantId: "t2",
        shipmentId: "s3",
        channel: "email",
        recipient: "c@test.com",
        subject: "Test 3",
        bodySent: "<p>3</p>",
        status: "sent",
        retryCount: 0,
      });
    });

    it("returns only tenant notifications", async () => {
      const result = await store.listNotifications("t1");
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by shipmentId", async () => {
      const result = await store.listNotifications("t1", { shipmentId: "s1" });
      expect(result.data).toHaveLength(1);
    });

    it("filters by status", async () => {
      const result = await store.listNotifications("t1", { status: "failed" });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].subject).toBe("Test 2");
    });

    it("applies pagination", async () => {
      const result = await store.listNotifications("t1", { limit: 1, offset: 0 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe("createRule, updateRule, deleteRule", () => {
    it("creates and retrieves a rule", async () => {
      const rule = await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      expect(rule.id).toBeDefined();
      const rules = await store.findRulesForMilestone("t1", "delivered");
      expect(rules).toHaveLength(1);
    });

    it("updates a rule", async () => {
      const rule = await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const updated = await store.updateRule(rule.id, "t1", { enabled: false, channel: "sms" });
      expect(updated).not.toBeNull();
      expect(updated!.enabled).toBe(false);
      expect(updated!.channel).toBe("sms");
    });

    it("returns null when updating wrong tenant rule", async () => {
      const rule = await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const updated = await store.updateRule(rule.id, "t2", { enabled: false });
      expect(updated).toBeNull();
    });

    it("deletes a rule", async () => {
      const rule = await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const deleted = await store.deleteRule(rule.id, "t1");
      expect(deleted).toBe(true);

      const rules = await store.findRulesForMilestone("t1", "delivered");
      expect(rules).toHaveLength(0);
    });

    it("returns false when deleting non-existent rule", async () => {
      const deleted = await store.deleteRule("nonexistent", "t1");
      expect(deleted).toBe(false);
    });

    it("returns false when deleting rule from wrong tenant", async () => {
      const rule = await store.createRule({
        tenantId: "t1",
        milestoneType: "delivered",
        channel: "email",
        enabled: true,
      });

      const deleted = await store.deleteRule(rule.id, "t2");
      expect(deleted).toBe(false);
    });
  });

  describe("clear", () => {
    it("clears all stored data", async () => {
      await store.createRule({ tenantId: "t1", milestoneType: "delivered", channel: "email", enabled: true });
      await store.insertNotification({
        tenantId: "t1", shipmentId: "s1", channel: "email",
        recipient: "a@b.com", subject: "T", bodySent: "<p></p>", status: "pending", retryCount: 0,
      });
      store.seedShipment({ id: "s1", tenantId: "t1", trackingId: "SL-1" });

      store.clear();

      const rules = await store.findRulesForMilestone("t1", "delivered");
      expect(rules).toHaveLength(0);

      const history = await store.listNotifications("t1");
      expect(history.data).toHaveLength(0);
    });
  });
});
