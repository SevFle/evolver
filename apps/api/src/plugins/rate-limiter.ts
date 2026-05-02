import type { FastifyInstance } from "fastify";

export async function rateLimiter(server: FastifyInstance) {
  server.decorate("rateLimit", async function rateLimitPlugin() {
    return {
      max: 100,
      timeWindow: "1 minute",
    };
  });
}
