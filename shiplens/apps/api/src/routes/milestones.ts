import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const milestoneRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: { message: "milestone created" } });
  });

  fastify.get("/shipment/:shipmentId", async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return reply.send({ success: true, data: { shipmentId, milestones: [] } });
  });

  fastify.get("/:milestoneId", async (request, reply) => {
    const { milestoneId } = request.params as { milestoneId: string };
    return reply.send({ success: true, data: { milestoneId } });
  });
};
