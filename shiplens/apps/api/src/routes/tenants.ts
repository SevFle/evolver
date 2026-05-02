import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const tenantRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.post("/", async (request, reply) => {
    return reply.status(201).send({ success: true, data: { message: "tenant created" } });
  });

  fastify.get("/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    return reply.send({ success: true, data: { tenantId } });
  });

  fastify.patch("/:tenantId", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    return reply.send({ success: true, data: { tenantId, message: "updated" } });
  });

  fastify.get("/:tenantId/branding", async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    return reply.send({
      success: true,
      data: {
        tenantId,
        name: "Tenant",
        logoUrl: null,
        primaryColor: "#000000",
      },
    });
  });
};
