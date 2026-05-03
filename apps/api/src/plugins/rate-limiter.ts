import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

async function rateLimiter(server: FastifyInstance) {
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
}

export const rateLimiterPlugin = fp(rateLimiter, { name: "shiplens-rate-limiter" });
