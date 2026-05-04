import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { NotificationDispatcher, NotificationStore } from "../services/notification-dispatcher";
import type { MilestoneType } from "@shiplens/shared";

interface RulePayload {
  milestoneType: MilestoneType;
  channel?: "email" | "sms" | "both";
  subjectTemplate?: string;
  bodyTemplate?: string;
  enabled?: boolean;
}

interface HistoryQuery {
  shipmentId?: string;
  status?: string;
  limit?: string;
  offset?: string;
}

export async function notificationRoutes(server: FastifyInstance) {
  const dispatcher = server.notificationDispatcher;
  const store = server.notificationStore;

  server.get("/rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    try {
      const rules = await store.findRulesForMilestone(tenantId, "" as MilestoneType);
      return reply.status(200).send({ success: true, data: rules });
    } catch (err) {
      request.log.error(err, "Failed to list notification rules");
      return reply.status(500).send({ success: false, error: "Failed to retrieve notification rules" });
    }
  });

  server.post("/rules", async (request: FastifyRequest<{ Body: RulePayload }>, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const { milestoneType, channel, subjectTemplate, bodyTemplate, enabled } = request.body ?? {};

    if (!milestoneType) {
      return reply.status(400).send({ success: false, error: "milestoneType is required" });
    }

    try {
      const rule = await store.createRule({
        tenantId,
        milestoneType,
        channel: channel ?? "email",
        subjectTemplate,
        bodyTemplate,
        enabled: enabled ?? true,
      });
      return reply.status(201).send({ success: true, data: rule, message: "Notification rule created" });
    } catch (err) {
      request.log.error(err, "Failed to create notification rule");
      return reply.status(500).send({ success: false, error: "Failed to create notification rule" });
    }
  });

  server.put("/rules/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: Partial<RulePayload> }>, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const { id } = request.params;
    const updates = request.body ?? {};

    try {
      const rule = await store.updateRule(id, tenantId, updates);
      if (!rule) {
        return reply.status(404).send({ success: false, error: "Rule not found" });
      }
      return reply.status(200).send({ success: true, data: rule, message: "Notification rule updated" });
    } catch (err) {
      request.log.error(err, "Failed to update notification rule");
      return reply.status(500).send({ success: false, error: "Failed to update notification rule" });
    }
  });

  server.delete("/rules/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const { id } = request.params;

    try {
      const deleted = await store.deleteRule(id, tenantId);
      if (!deleted) {
        return reply.status(404).send({ success: false, error: "Rule not found" });
      }
      return reply.status(200).send({ success: true, message: "Notification rule deleted" });
    } catch (err) {
      request.log.error(err, "Failed to delete notification rule");
      return reply.status(500).send({ success: false, error: "Failed to delete notification rule" });
    }
  });

  server.get("/history", async (request: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const { shipmentId, status, limit: rawLimit, offset: rawOffset } = request.query;
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit ?? "25", 10) || 25));
    const offset = Math.max(0, parseInt(rawOffset ?? "0", 10) || 0);

    try {
      const result = await dispatcher.getHistory(tenantId, { shipmentId, status, limit, offset });
      return reply.status(200).send({
        success: true,
        data: result.data,
        total: result.total,
        limit,
        offset,
      });
    } catch (err) {
      request.log.error(err, "Failed to list notification history");
      return reply.status(500).send({ success: false, error: "Failed to retrieve notification history" });
    }
  });

  server.post("/:id/resend", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const { id } = request.params;

    try {
      const result = await dispatcher.resend(id, tenantId);
      if (result.errors.length > 0 && result.notifications.length === 0) {
        return reply.status(400).send({ success: false, error: result.errors[0] });
      }
      return reply.status(200).send({
        success: true,
        data: result.notifications[0] ?? null,
        message: "Notification resent",
      });
    } catch (err) {
      request.log.error(err, "Failed to resend notification");
      return reply.status(500).send({ success: false, error: "Failed to resend notification" });
    }
  });
}
