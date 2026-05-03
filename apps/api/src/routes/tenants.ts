import type { FastifyInstance } from "fastify";

export async function tenantRoutes(server: FastifyInstance) {
  server.get("/current", async (request, reply) => {
    return reply.status(200).send({ success: true, data: { tenantId: request.tenantId } });
  });

  server.patch("/current", async (request, reply) => {
    return reply.status(200).send({ success: true, data: null, message: "Tenant updated" });
  });
}
