import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const notificationRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.get("/shipment/:shipmentId", async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return reply.send({ success: true, data: { shipmentId, notifications: [] } });
  });

  fastify.post("/rules", async (request, reply) => {
    return reply.status(201).send({ success: true, data: { message: "rule created" } });
  });

  fastify.get("/rules/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    return reply.send({ success: true, data: { tenantId, rules: [] } });
  });
};
