import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const trackingPageRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.send({
      success: true,
      data: {
        trackingId,
        shipment: null,
        milestones: [],
        branding: {
          name: "ShipLens",
          primaryColor: "#2563eb",
        },
      },
    });
  });
};
