import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MilestoneType } from "@shiplens/shared";

interface CreateMilestonePayload {
  shipmentId: string;
  type: MilestoneType;
  description?: string;
  location?: string;
  occurredAt?: string;
}

export async function milestoneRoutes(server: FastifyInstance) {
  server.get(
    "/shipment/:shipmentId",
    async (request: FastifyRequest<{ Params: { shipmentId: string } }>, reply: FastifyReply) => {
      const { shipmentId } = request.params;
      return reply.status(200).send({ success: true, data: [], shipmentId });
    }
  );

  server.post(
    "/",
    async (request: FastifyRequest<{ Body: CreateMilestonePayload }>, reply: FastifyReply) => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ success: false, error: "Authentication required" });
      }

      const { shipmentId, type, description, location, occurredAt } = request.body ?? {};

      if (!shipmentId || !type) {
        return reply.status(400).send({ success: false, error: "shipmentId and type are required" });
      }

      const milestoneId = crypto.randomUUID();
      const timestamp = occurredAt ?? new Date().toISOString();

      try {
        const dispatcher = server.notificationDispatcher;
        if (dispatcher) {
          await dispatcher.dispatchForMilestone(shipmentId, {
            id: milestoneId,
            shipmentId,
            type,
            description,
            location,
            occurredAt: timestamp,
          }, tenantId);
        }
      } catch (err) {
        request.log.error(err, "Failed to dispatch notifications for milestone");
      }

      return reply.status(201).send({
        success: true,
        data: {
          id: milestoneId,
          shipmentId,
          type,
          description,
          location,
          occurredAt: timestamp,
        },
        message: "Milestone created",
      });
    }
  );
}
