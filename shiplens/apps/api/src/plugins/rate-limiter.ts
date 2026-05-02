import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const rateLimiterPlugin: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  await fastify.register(import("@fastify/rate-limit"), {
    max: 100,
    timeWindow: "1 minute",
    skip: (request) => {
      return request.url.startsWith("/api/health");
    },
  });
};
