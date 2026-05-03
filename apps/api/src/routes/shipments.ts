import type { FastifyInstance } from "fastify";

export async function shipmentRoutes(server: FastifyInstance) {
  server.get("/", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: null, message: "Shipment created" });
  });

  server.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply.status(200).send({ success: true, data: { trackingId } });
  });
}
