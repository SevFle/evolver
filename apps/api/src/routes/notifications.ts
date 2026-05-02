import type { FastifyInstance } from "fastify";

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
}
