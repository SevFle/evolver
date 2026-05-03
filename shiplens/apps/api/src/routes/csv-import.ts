import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const csvImportRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.post("/upload", async (request, reply) => {
    return reply.status(202).send({ success: true, data: { message: "import queued" } });
  });

  fastify.get("/status/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    return reply.send({ success: true, data: { jobId, status: "pending" } });
  });
};
