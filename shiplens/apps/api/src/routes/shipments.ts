import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const shipmentRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: { message: "shipment created" } });
  });

  fastify.get("/", async (_request, reply) => {
    return reply.send({ success: true, data: [] });
  });

  fastify.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.send({ success: true, data: { trackingId } });
  });

  fastify.patch("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.send({ success: true, data: { trackingId, message: "updated" } });
  });

  fastify.delete("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.status(204).send();
  });
};
