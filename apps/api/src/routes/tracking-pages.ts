import type { FastifyInstance } from "fastify";

export async function trackingPageRoutes(server: FastifyInstance) {
  server.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.status(200).send({ success: true, data: { trackingId } });
  });
}
