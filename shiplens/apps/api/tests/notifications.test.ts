import { describe, it, expect, beforeEach } from "vitest";
import { buildServer } from "../src/server";

describe("Notification routes - Template CRUD", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    server = await buildServer();
  });

  describe("POST /api/notifications/templates", () => {
    it("creates a notification template", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Booked Email",
          milestoneType: "booked",
          channel: "email",
          subject: "Your shipment {{trackingId}} is booked!",
          bodyHtml: "<p>Hello {{customerName}}</p>",
          tenantId: "tenant-1",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Booked Email");
      expect(body.data.milestoneType).toBe("booked");
      expect(body.data.channel).toBe("email");
      expect(body.data.subject).toBe("Your shipment {{trackingId}} is booked!");
      expect(body.data.id).toBeDefined();
    });

    it("returns 400 when name is missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          milestoneType: "booked",
          channel: "email",
          bodyText: "Hello",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("name is required");
    });

    it("returns 400 when milestoneType is invalid", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "invalid_status",
          channel: "email",
          bodyText: "Hello",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("milestoneType");
    });

    it("returns 400 when channel is invalid", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "booked",
          channel: "push",
          bodyText: "Hello",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("channel");
    });

    it("returns 400 when subject is missing for email channel", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "booked",
          channel: "email",
          bodyText: "Hello",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("subject");
    });

    it("returns 400 when both bodyHtml and bodyText are missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "booked",
          channel: "sms",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("bodyHtml");
    });

    it("returns 400 when body is missing entirely", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
      });

      expect(response.statusCode).toBe(400);
    });

    it("creates SMS template without subject", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Booked SMS",
          milestoneType: "booked",
          channel: "sms",
          bodyText: "Your shipment {{trackingId}} is booked",
          tenantId: "tenant-1",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.channel).toBe("sms");
      expect(body.data.subject).toBeNull();
    });

    it("accepts all valid milestone types", async () => {
      const types = [
        "pending",
        "booked",
        "in_transit",
        "at_port",
        "customs_clearance",
        "out_for_delivery",
        "delivered",
        "exception",
      ];

      for (const type of types) {
        const response = await server.inject({
          method: "POST",
          url: "/api/notifications/templates",
          payload: {
            name: `Template ${type}`,
            milestoneType: type,
            channel: "sms",
            bodyText: "test",
            tenantId: "tenant-1",
          },
        });
        expect(response.statusCode).toBe(201);
      }
    });
  });

  describe("GET /api/notifications/templates/:tenantId", () => {
    it("returns templates for a tenant", async () => {
      await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Template 1",
          milestoneType: "booked",
          channel: "email",
          subject: "Test",
          bodyText: "Hello",
          tenantId: "tenant-list",
        },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/notifications/templates/tenant-list",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Template 1");
    });

    it("returns empty array for tenant with no templates", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/notifications/templates/nonexistent-tenant",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([]);
    });
  });

  describe("GET /api/notifications/templates/detail/:templateId", () => {
    it("returns template by ID", async () => {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Detail Template",
          milestoneType: "delivered",
          channel: "email",
          subject: "Delivered!",
          bodyHtml: "<p>Done</p>",
          tenantId: "tenant-1",
        },
      });

      const templateId = createResponse.json().data.id;

      const response = await server.inject({
        method: "GET",
        url: `/api/notifications/templates/detail/${templateId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.name).toBe("Detail Template");
    });

    it("returns 404 for nonexistent template", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/notifications/templates/detail/nonexistent-id",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/notifications/templates/:templateId", () => {
    it("updates a template", async () => {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Original",
          milestoneType: "booked",
          channel: "email",
          subject: "Original Subject",
          bodyText: "Original body",
          tenantId: "tenant-1",
        },
      });

      const templateId = createResponse.json().data.id;

      const response = await server.inject({
        method: "PUT",
        url: `/api/notifications/templates/${templateId}`,
        payload: {
          name: "Updated Name",
          subject: "Updated Subject",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe("Updated Name");
      expect(body.data.subject).toBe("Updated Subject");
    });

    it("returns 404 for nonexistent template", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/api/notifications/templates/nonexistent-id",
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for invalid milestoneType", async () => {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "booked",
          channel: "email",
          subject: "Test",
          bodyText: "Test",
          tenantId: "tenant-1",
        },
      });

      const templateId = createResponse.json().data.id;

      const response = await server.inject({
        method: "PUT",
        url: `/api/notifications/templates/${templateId}`,
        payload: { milestoneType: "invalid_type" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for invalid channel", async () => {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "Test",
          milestoneType: "booked",
          channel: "email",
          subject: "Test",
          bodyText: "Test",
          tenantId: "tenant-1",
        },
      });

      const templateId = createResponse.json().data.id;

      const response = await server.inject({
        method: "PUT",
        url: `/api/notifications/templates/${templateId}`,
        payload: { channel: "fax" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/notifications/templates/:templateId", () => {
    it("deletes a template", async () => {
      const createResponse = await server.inject({
        method: "POST",
        url: "/api/notifications/templates",
        payload: {
          name: "To Delete",
          milestoneType: "booked",
          channel: "email",
          subject: "Delete",
          bodyText: "Delete",
          tenantId: "tenant-1",
        },
      });

      const templateId = createResponse.json().data.id;

      const response = await server.inject({
        method: "DELETE",
        url: `/api/notifications/templates/${templateId}`,
      });

      expect(response.statusCode).toBe(204);

      const getResponse = await server.inject({
        method: "GET",
        url: `/api/notifications/templates/detail/${templateId}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("returns 404 for nonexistent template", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/notifications/templates/nonexistent-id",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

describe("Notification routes - Rules CRUD", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    server = await buildServer();
  });

  it("creates a notification rule", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: {
        triggerStatus: "booked",
        channel: "email",
        tenantId: "tenant-1",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.triggerStatus).toBe("booked");
    expect(body.data.channel).toBe("email");
    expect(body.data.id).toBeDefined();
  });

  it("returns 400 when triggerStatus is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { channel: "email" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when channel is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { triggerStatus: "booked" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for invalid triggerStatus", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { triggerStatus: "invalid", channel: "email" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
    });

    expect(response.statusCode).toBe(400);
  });

  it("gets rules for a tenant", async () => {
    await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { triggerStatus: "booked", channel: "email", tenantId: "tenant-rules" },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/notifications/rules/tenant-rules",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
  });

  it("patches a rule", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { triggerStatus: "booked", channel: "email", tenantId: "tenant-1" },
    });

    const ruleId = createResponse.json().data.id;

    const response = await server.inject({
      method: "PATCH",
      url: `/api/notifications/rules/${ruleId}`,
      payload: { isEnabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.isEnabled).toBe(false);
  });

  it("returns 404 when patching nonexistent rule", async () => {
    const response = await server.inject({
      method: "PATCH",
      url: "/api/notifications/rules/nonexistent",
      payload: { isEnabled: false },
    });

    expect(response.statusCode).toBe(404);
  });

  it("deletes a rule", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/notifications/rules",
      payload: { triggerStatus: "delivered", channel: "sms", tenantId: "tenant-1" },
    });

    const ruleId = createResponse.json().data.id;

    const response = await server.inject({
      method: "DELETE",
      url: `/api/notifications/rules/${ruleId}`,
    });

    expect(response.statusCode).toBe(204);
  });

  it("returns 404 when deleting nonexistent rule", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/notifications/rules/nonexistent",
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("Notification routes - Preferences", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    server = await buildServer();
  });

  it("gets default preferences for tenant", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/notifications/preferences/tenant-new",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.emailEnabled).toBe(true);
    expect(body.data.smsEnabled).toBe(false);
    expect(body.data.maxRetries).toBe(3);
  });

  it("updates preferences", async () => {
    const response = await server.inject({
      method: "PUT",
      url: "/api/notifications/preferences/tenant-1",
      payload: {
        emailEnabled: true,
        smsEnabled: true,
        defaultFromEmail: "noreply@tenant.com",
        maxRetries: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.emailEnabled).toBe(true);
    expect(body.data.smsEnabled).toBe(true);
    expect(body.data.defaultFromEmail).toBe("noreply@tenant.com");
    expect(body.data.maxRetries).toBe(5);
  });

  it("persists and retrieves preferences", async () => {
    await server.inject({
      method: "PUT",
      url: "/api/notifications/preferences/tenant-persist",
      payload: { emailEnabled: false, smsEnabled: true },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/notifications/preferences/tenant-persist",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.emailEnabled).toBe(false);
    expect(response.json().data.smsEnabled).toBe(true);
  });
});

describe("Notification routes - Manual Trigger", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    server = await buildServer();
  });

  it("queues a manual notification", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
      payload: {
        shipmentId: "ship-001",
        channel: "email",
        recipient: "user@example.com",
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("queued");
    expect(body.data.shipmentId).toBe("ship-001");
  });

  it("returns 400 when shipmentId is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
      payload: { channel: "email", recipient: "user@example.com" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("shipmentId");
  });

  it("returns 400 when channel is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
      payload: { shipmentId: "ship-001", recipient: "user@example.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when recipient is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
      payload: { shipmentId: "ship-001", channel: "email" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("recipient");
  });

  it("returns 400 when body is missing", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for invalid channel", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/notifications/trigger",
      payload: { shipmentId: "ship-001", channel: "fax", recipient: "user@example.com" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("Notification routes - Shipment notifications", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    server = await buildServer();
  });

  it("gets notifications for a shipment", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/notifications/shipment/ship-001",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.shipmentId).toBe("ship-001");
    expect(body.data.notifications).toEqual([]);
  });
});
