import type { FastifyInstance } from "fastify";

export async function csvImportRoutes(server: FastifyInstance) {
  server.post("/", async (_request, reply) => {
    return reply.status(202).send({ success: true, message: "CSV import queued" });
  });

  server.get("/:jobId/status", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    return reply.status(200).send({ success: true, data: { jobId, status: "pending" } });
  });
}
