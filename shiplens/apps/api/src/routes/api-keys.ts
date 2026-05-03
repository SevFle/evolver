import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const apiKeyRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: { message: "api key created" } });
  });

  fastify.get("/", async (_request, reply) => {
    return reply.send({ success: true, data: [] });
  });

  fastify.delete("/:keyId", async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    return reply.status(204).send();
  });
};
