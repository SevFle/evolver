import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface MilestoneBody {
  type: string;
  description?: string;
  location?: string;
  occurredAt?: string;
  carrierData?: Record<string, unknown>;
  shipmentId?: string;
}

interface MilestoneRequest extends FastifyRequest {
  tenantId?: string;
}

export async function milestoneRoutes(server: FastifyInstance) {
  server.get("/shipment/:shipmentId", async (request: MilestoneRequest, reply: FastifyReply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return reply.status(200).send({ success: true, data: [], shipmentId });
  });

  server.post("/", async (request: MilestoneRequest, reply: FastifyReply) => {
    const body = request.body as MilestoneBody | undefined;

    if (!body?.type) {
      return reply.status(400).send({
        success: false,
        error: "Milestone type is required",
      });
    }

    const validTypes = [
      "booked", "picked_up", "departed_origin", "in_transit",
      "arrived_port", "customs_cleared", "departed_terminal",
      "out_for_delivery", "delivered", "exception",
    ];

    if (!validTypes.includes(body.type)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid milestone type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const milestone = {
      id: crypto.randomUUID(),
      shipmentId: body.shipmentId ?? crypto.randomUUID(),
      type: body.type,
      description: body.description ?? null,
      location: body.location ?? null,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      notificationTriggered: false,
    };

    const notificationTemplates: Record<string, string> = {
      picked_up: "picked_up",
      in_transit: "in_transit",
      delivered: "delivered",
      exception: "exception",
    };

    if (notificationTemplates[body.type]) {
      milestone.notificationTriggered = true;
    }

    return reply.status(201).send({
      success: true,
      data: milestone,
      message: "Milestone created",
    });
  });
}
