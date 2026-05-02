import type { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.0.1",
    });
  });
}
