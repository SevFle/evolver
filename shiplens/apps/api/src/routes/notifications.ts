import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

const VALID_MILESTONE_TYPES = [
  "pending",
  "booked",
  "in_transit",
  "at_port",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "exception",
] as const;

const VALID_CHANNELS = ["email", "sms"] as const;

function isValidMilestoneType(value: unknown): value is string {
  return typeof value === "string" && (VALID_MILESTONE_TYPES as readonly string[]).includes(value);
}

function isValidChannel(value: unknown): value is string {
  return typeof value === "string" && (VALID_CHANNELS as readonly string[]).includes(value);
}

const templatesStore = new Map<string, Record<string, unknown>>();
const rulesStore = new Map<string, Record<string, unknown>>();
const preferencesStore = new Map<string, Record<string, unknown>>();

export const notificationRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.get("/shipment/:shipmentId", async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return reply.send({ success: true, data: { shipmentId, notifications: [] } });
  });

  fastify.post("/templates", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      return reply.status(400).send({ success: false, error: "Request body is required" });
    }

    if (!body.name || typeof body.name !== "string") {
      return reply.status(400).send({ success: false, error: "Template name is required" });
    }

    if (!body.milestoneType || !isValidMilestoneType(body.milestoneType)) {
      return reply.status(400).send({
        success: false,
        error: `milestoneType must be one of: ${VALID_MILESTONE_TYPES.join(", ")}`,
      });
    }

    if (!body.channel || !isValidChannel(body.channel)) {
      return reply.status(400).send({
        success: false,
        error: `channel must be one of: ${VALID_CHANNELS.join(", ")}`,
      });
    }

    if (body.channel === "email" && !body.subject) {
      return reply.status(400).send({ success: false, error: "subject is required for email templates" });
    }

    if (!body.bodyHtml && !body.bodyText) {
      return reply.status(400).send({ success: false, error: "At least one of bodyHtml or bodyText is required" });
    }

    const id = crypto.randomUUID();
    const template = {
      id,
      tenantId: body.tenantId ?? "default",
      name: body.name,
      milestoneType: body.milestoneType,
      channel: body.channel,
      subject: body.subject ?? null,
      bodyHtml: body.bodyHtml ?? null,
      bodyText: body.bodyText ?? null,
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    templatesStore.set(id, template);

    return reply.status(201).send({ success: true, data: template });
  });

  fastify.get("/templates/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenantTemplates = Array.from(templatesStore.values()).filter(
      (t) => t.tenantId === tenantId,
    );
    return reply.send({ success: true, data: tenantTemplates });
  });

  fastify.get("/templates/detail/:templateId", async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const template = templatesStore.get(templateId);
    if (!template) {
      return reply.status(404).send({ success: false, error: "Template not found" });
    }
    return reply.send({ success: true, data: template });
  });

  fastify.put("/templates/:templateId", async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const body = request.body as Record<string, unknown>;
    const existing = templatesStore.get(templateId);
    if (!existing) {
      return reply.status(404).send({ success: false, error: "Template not found" });
    }

    if (body.milestoneType && !isValidMilestoneType(body.milestoneType)) {
      return reply.status(400).send({ success: false, error: "Invalid milestoneType" });
    }

    if (body.channel && !isValidChannel(body.channel)) {
      return reply.status(400).send({ success: false, error: "Invalid channel" });
    }

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.milestoneType) updates.milestoneType = body.milestoneType;
    if (body.channel) updates.channel = body.channel;
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.bodyHtml !== undefined) updates.bodyHtml = body.bodyHtml;
    if (body.bodyText !== undefined) updates.bodyText = body.bodyText;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    templatesStore.set(templateId, updated);
    return reply.send({ success: true, data: updated });
  });

  fastify.delete("/templates/:templateId", async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const existing = templatesStore.get(templateId);
    if (!existing) {
      return reply.status(404).send({ success: false, error: "Template not found" });
    }
    templatesStore.delete(templateId);
    return reply.status(204).send();
  });

  fastify.post("/rules", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      return reply.status(400).send({ success: false, error: "Request body is required" });
    }

    if (!body.triggerStatus || !isValidMilestoneType(body.triggerStatus)) {
      return reply.status(400).send({ success: false, error: "Valid triggerStatus is required" });
    }

    if (!body.channel || !isValidChannel(body.channel)) {
      return reply.status(400).send({ success: false, error: "Valid channel is required" });
    }

    const id = crypto.randomUUID();
    const rule = {
      id,
      tenantId: body.tenantId ?? "default",
      triggerStatus: body.triggerStatus,
      channel: body.channel,
      templateId: body.templateId ?? null,
      isEnabled: body.isEnabled ?? true,
      delayMinutes: body.delayMinutes ?? 0,
      createdAt: new Date().toISOString(),
    };

    rulesStore.set(id, rule);
    return reply.status(201).send({ success: true, data: rule });
  });

  fastify.get("/rules/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenantRules = Array.from(rulesStore.values()).filter(
      (r) => r.tenantId === tenantId,
    );
    return reply.send({ success: true, data: tenantRules });
  });

  fastify.patch("/rules/:ruleId", async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const body = request.body as Record<string, unknown>;
    const existing = rulesStore.get(ruleId);
    if (!existing) {
      return reply.status(404).send({ success: false, error: "Rule not found" });
    }

    const updated = {
      ...existing,
      ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      ...(body.templateId !== undefined && { templateId: body.templateId }),
      ...(body.delayMinutes !== undefined && { delayMinutes: body.delayMinutes }),
    };

    rulesStore.set(ruleId, updated);
    return reply.send({ success: true, data: updated });
  });

  fastify.delete("/rules/:ruleId", async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const existing = rulesStore.get(ruleId);
    if (!existing) {
      return reply.status(404).send({ success: false, error: "Rule not found" });
    }
    rulesStore.delete(ruleId);
    return reply.status(204).send();
  });

  fastify.get("/preferences/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const prefs = preferencesStore.get(tenantId);
    if (!prefs) {
      return reply.send({
        success: true,
        data: {
          tenantId,
          emailEnabled: true,
          smsEnabled: false,
          defaultFromEmail: null,
          defaultFromSmsNumber: null,
          quietHoursStart: null,
          quietHoursEnd: null,
          quietHoursTimezone: null,
          maxRetries: 3,
          retryIntervalMinutes: 30,
        },
      });
    }
    return reply.send({ success: true, data: prefs });
  });

  fastify.put("/preferences/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const body = request.body as Record<string, unknown>;

    const prefs = {
      tenantId,
      emailEnabled: body.emailEnabled ?? true,
      smsEnabled: body.smsEnabled ?? false,
      defaultFromEmail: body.defaultFromEmail ?? null,
      defaultFromSmsNumber: body.defaultFromSmsNumber ?? null,
      quietHoursStart: body.quietHoursStart ?? null,
      quietHoursEnd: body.quietHoursEnd ?? null,
      quietHoursTimezone: body.quietHoursTimezone ?? null,
      maxRetries: body.maxRetries ?? 3,
      retryIntervalMinutes: body.retryIntervalMinutes ?? 30,
      updatedAt: new Date().toISOString(),
    };

    preferencesStore.set(tenantId, prefs);
    return reply.send({ success: true, data: prefs });
  });

  fastify.post("/trigger", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      return reply.status(400).send({ success: false, error: "Request body is required" });
    }

    if (!body.shipmentId || typeof body.shipmentId !== "string") {
      return reply.status(400).send({ success: false, error: "shipmentId is required" });
    }

    if (!body.channel || !isValidChannel(body.channel)) {
      return reply.status(400).send({ success: false, error: "Valid channel is required" });
    }

    if (!body.recipient || typeof body.recipient !== "string") {
      return reply.status(400).send({ success: false, error: "recipient is required" });
    }

    return reply.status(202).send({
      success: true,
      data: {
        shipmentId: body.shipmentId,
        channel: body.channel,
        recipient: body.recipient,
        status: "queued",
      },
    });
  });
};

export { templatesStore, rulesStore, preferencesStore };
