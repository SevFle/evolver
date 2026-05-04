import type { FastifyInstance } from "fastify";
import { sendMilestoneEmail } from "@shiplens/notifications";
import type { TemplateName } from "@shiplens/notifications";

const VALID_MILESTONE_TYPES: TemplateName[] = ["picked_up", "in_transit", "delivered", "exception"];

interface SendNotificationBody {
  milestoneType: TemplateName;
  trackingId: string;
  origin: string;
  destination: string;
  carrier?: string;
  customerName?: string;
  customerEmail?: string;
  estimatedDelivery?: string;
  location?: string;
  description?: string;
  occurredAt?: string;
}

export async function notificationRoutes(server: FastifyInstance) {
  server.get("/rules", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post("/rules", async (_request, reply) => {
    return reply.status(201).send({ success: true, data: null, message: "Notification rule created" });
  });

  server.get("/history", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post<{
    Body: SendNotificationBody;
  }>("/send", async (request, reply) => {
    const body = request.body;

    if (!body.milestoneType || !VALID_MILESTONE_TYPES.includes(body.milestoneType)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid milestoneType. Must be one of: ${VALID_MILESTONE_TYPES.join(", ")}`,
      });
    }

    if (!body.trackingId || !body.origin || !body.destination) {
      return reply.status(400).send({
        success: false,
        error: "trackingId, origin, and destination are required",
      });
    }

    if (!body.customerEmail) {
      return reply.status(400).send({
        success: false,
        error: "customerEmail is required to send notification",
      });
    }

    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "notifications@shiplens.io";

    const result = await sendMilestoneEmail({
      templateName: body.milestoneType,
      shipmentData: {
        trackingId: body.trackingId,
        origin: body.origin,
        destination: body.destination,
        carrier: body.carrier,
        customerName: body.customerName,
        estimatedDelivery: body.estimatedDelivery,
        location: body.location,
        description: body.description,
        occurredAt: body.occurredAt,
      },
      to: body.customerEmail,
      from: fromEmail,
    });

    if (!result.success) {
      return reply.status(502).send({
        success: false,
        error: result.error,
        message: "Failed to send notification email",
      });
    }

    return reply.status(200).send({
      success: true,
      data: { messageId: result.messageId },
      message: "Notification sent",
    });
  });
}
