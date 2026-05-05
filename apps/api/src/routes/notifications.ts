import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getOrchestrator, resetOrchestrator } from "@shiplens/notifications";
import type { MilestoneEvent } from "@shiplens/notifications";

interface TenantRequest extends FastifyRequest {
  tenantId?: string;
}

interface CreateRuleBody {
  milestoneType: string;
  channel?: "email" | "sms" | "both";
  templateId?: string;
  enabled?: boolean;
}

interface UpdatePreferencesBody {
  defaultChannel?: "email" | "sms" | "both";
  fromEmail?: string;
  fromSmsNumber?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
  enabled?: boolean;
}

export async function notificationRoutes(server: FastifyInstance) {
  server.get("/rules", async (_request: TenantRequest, reply: FastifyReply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post("/rules", async (request: TenantRequest, reply: FastifyReply) => {
    const body = request.body as CreateRuleBody | undefined;

    if (!body?.milestoneType) {
      return reply.status(400).send({
        success: false,
        error: "milestoneType is required",
      });
    }

    const validMilestoneTypes = [
      "booked", "picked_up", "departed_origin", "in_transit",
      "arrived_port", "customs_cleared", "departed_terminal",
      "out_for_delivery", "delivered", "exception",
    ];

    if (!validMilestoneTypes.includes(body.milestoneType)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid milestoneType. Must be one of: ${validMilestoneTypes.join(", ")}`,
      });
    }

    const validChannels = ["email", "sms", "both"];
    if (body.channel && !validChannels.includes(body.channel)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid channel. Must be one of: ${validChannels.join(", ")}`,
      });
    }

    return reply.status(201).send({
      success: true,
      data: {
        milestoneType: body.milestoneType,
        channel: body.channel ?? "email",
        templateId: body.templateId ?? null,
        enabled: body.enabled ?? true,
      },
      message: "Notification rule created",
    });
  });

  server.get("/history", async (_request: TenantRequest, reply: FastifyReply) => {
    const orchestrator = getOrchestrator();
    const logs = orchestrator.getLogs();
    return reply.status(200).send({ success: true, data: logs });
  });

  server.get("/preferences", async (_request: TenantRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        defaultChannel: "email",
        fromEmail: null,
        fromSmsNumber: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: null,
        enabled: true,
      },
    });
  });

  server.patch("/preferences", async (request: TenantRequest, reply: FastifyReply) => {
    const body = request.body as UpdatePreferencesBody | undefined;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        success: false,
        error: "At least one preference field is required",
      });
    }

    const validChannels = ["email", "sms", "both"];
    if (body.defaultChannel && !validChannels.includes(body.defaultChannel)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid defaultChannel. Must be one of: ${validChannels.join(", ")}`,
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        defaultChannel: body.defaultChannel ?? "email",
        fromEmail: body.fromEmail ?? null,
        fromSmsNumber: body.fromSmsNumber ?? null,
        quietHoursStart: body.quietHoursStart ?? null,
        quietHoursEnd: body.quietHoursEnd ?? null,
        quietHoursTimezone: body.quietHoursTimezone ?? null,
        enabled: body.enabled ?? true,
      },
      message: "Notification preferences updated",
    });
  });

  server.post("/test", async (request: TenantRequest, reply: FastifyReply) => {
    const body = request.body as {
      milestoneType: string;
      trackingId: string;
      to: string;
    } | undefined;

    if (!body?.milestoneType || !body?.trackingId || !body?.to) {
      return reply.status(400).send({
        success: false,
        error: "milestoneType, trackingId, and to are required",
      });
    }

    const event: MilestoneEvent = {
      shipmentId: "test-shipment-id",
      tenantId: request.tenantId ?? "unknown",
      milestoneType: body.milestoneType,
      shipmentData: {
        trackingId: body.trackingId,
        origin: "Origin",
        destination: "Destination",
        customerName: "Test Customer",
      },
      recipientEmail: body.to,
      fromEmail: "test@shiplens.com",
      channel: "email",
    };

    try {
      const orchestrator = getOrchestrator();
      const results = await orchestrator.handleMilestone(event);
      return reply.status(200).send({
        success: true,
        data: results,
        message: "Test notification sent",
      });
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: err instanceof Error ? err.message : "Failed to send test notification",
      });
    }
  });
}

export { getOrchestrator, resetOrchestrator };
