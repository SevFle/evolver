import type { FastifyInstance } from "fastify";
import crypto from "crypto";

export async function apiKeyRoutes(server: FastifyInstance) {
  server.get("/", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post("/", async (_request, reply) => {
    const key = crypto.randomBytes(32).toString("hex");
    return reply.status(201).send({ success: true, data: { key }, message: "API key created" });
  });

  server.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.status(200).send({ success: true, message: `API key ${id} revoked` });
  });
}
