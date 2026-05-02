import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const authPlugin: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const path = request.url;
    if (path.startsWith("/api/health")) return;

    const apiKey = request.headers["x-api-key"];
    const authHeader = request.headers.authorization;

    if (!apiKey && !authHeader) {
      if (path.startsWith("/api/shipments") || path.startsWith("/api/milestones")) {
        return reply.status(401).send({ success: false, error: "Authentication required" });
      }
    }
  });
};
