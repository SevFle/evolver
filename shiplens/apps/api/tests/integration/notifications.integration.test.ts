import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Notification API integration", () => {
  let server: any;

  beforeEach(async () => {
    const { buildServer } = await import("../../src/server");
    server = await buildServer();
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  describe("Template lifecycle", () => {
    it("creates, reads, updates, and deletes a template", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Lifecycle Template",
          milestoneType: "in_transit",
          channel: "email",
          subject: "Shipment {{trackingId}} in transit",
          bodyHtml: "<p>Hi {{customerName}}, your package is in transit.</p>",
          bodyText: "Hi {{customerName}}, your package is in transit.",
          tenantId: "integration-tenant",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const templateId = createRes.json().data.id;

      const getRes = await server.inject({
        method: "GET",
        url: `/api/notifications/templates/detail/${templateId}`,
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.name).toBe("Lifecycle Template");

      const updateRes = await server.inject({
        method: "PUT",
        url: `/api/notifications/templates/${templateId}`,
        payload: { name: "Updated Lifecycle Template", isActive: false },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().data.name).toBe("Updated Lifecycle Template");
      expect(updateRes.json().data.isActive).toBe(false);

      const listRes = await server.inject({
        method: "GET",
        url: "/api/notifications/templates/integration-tenant",
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);

      const deleteRes = await server.inject({
        method: "DELETE",
        url: `/api/notifications/templates/${templateId}`,
      });
      expect(deleteRes.statusCode).toBe(204);

      const getDeletedRes = await server.inject({
        method: "GET",
        url: `/api/notifications/templates/detail/${templateId}`,
      });
      expect(getDeletedRes.statusCode).toBe(404);
    });
  });

  describe("Rules lifecycle", () => {
    it("creates, lists, patches, and deletes rules", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/api/notifications/rules",
        payload: {
          triggerStatus: "delivered",
          channel: "sms",
          templateId: "tmpl-1",
          delayMinutes: 5,
          tenantId: "integration-tenant",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const ruleId = createRes.json().data.id;

      const listRes = await server.inject({
        method: "GET",
        url: "/api/notifications/rules/integration-tenant",
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);

      const patchRes = await server.inject({
        method: "PATCH",
        url: `/api/notifications/rules/${ruleId}`,
        payload: { isEnabled: false, delayMinutes: 10 },
      });
      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().data.isEnabled).toBe(false);
      expect(patchRes.json().data.delayMinutes).toBe(10);

      const deleteRes = await server.inject({
        method: "DELETE",
        url: `/api/notifications/rules/${ruleId}`,
      });
      expect(deleteRes.statusCode).toBe(204);

      const listAfterDeleteRes = await server.inject({
        method: "GET",
        url: "/api/notifications/rules/integration-tenant",
      });
      expect(listAfterDeleteRes.json().data).toHaveLength(0);
    });
  });

  describe("Preferences lifecycle", () => {
    it("sets and retrieves notification preferences", async () => {
      const putRes = await server.inject({
        method: "PUT",
        url: "/api/notifications/preferences/integration-tenant",
        payload: {
          emailEnabled: true,
          smsEnabled: true,
          defaultFromEmail: "noreply@integration.com",
          defaultFromSmsNumber: "+15551234567",
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          quietHoursTimezone: "America/New_York",
          maxRetries: 5,
          retryIntervalMinutes: 15,
        },
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().data.emailEnabled).toBe(true);
      expect(putRes.json().data.smsEnabled).toBe(true);
      expect(putRes.json().data.quietHoursStart).toBe("22:00");

      const getRes = await server.inject({
        method: "GET",
        url: "/api/notifications/preferences/integration-tenant",
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.defaultFromEmail).toBe("noreply@integration.com");
      expect(getRes.json().data.maxRetries).toBe(5);
    });
  });

  describe("Manual trigger", () => {
    it("queues notification for manual dispatch", async () => {
      const triggerRes = await server.inject({
        method: "POST",
        url: "/api/notifications/trigger",
        payload: {
          shipmentId: "ship-integration-001",
          channel: "email",
          recipient: "integration@test.com",
        },
      });
      expect(triggerRes.statusCode).toBe(202);
      expect(triggerRes.json().data.status).toBe("queued");
    });
  });

  describe("Shipment notifications", () => {
    it("returns notification history for a shipment", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/notifications/shipment/ship-integration-001",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.shipmentId).toBe("ship-integration-001");
    });
  });

  describe("Error handling", () => {
    it("rejects invalid template with comprehensive error", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: { name: "", milestoneType: "", channel: "" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it("rejects updating nonexistent template", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/notifications/templates/nonexistent",
        payload: { name: "Test" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects trigger with missing fields", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/notifications/trigger",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
