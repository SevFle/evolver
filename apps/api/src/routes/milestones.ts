import type { FastifyInstance } from "fastify";

export async function milestoneRoutes(server: FastifyInstance) {
  server.get("/shipment/:shipmentId", async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return reply.status(200).send({ success: true, data: [], shipmentId });
  });

  server.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: null, message: "Milestone created" });
  });
}
