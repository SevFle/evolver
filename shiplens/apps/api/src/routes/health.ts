import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const healthRoutes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.get("/api/health", async (_request, reply) => {
    let dbStatus: "ok" | "error" = "ok";
    let redisStatus: "ok" | "error" = "ok";

    try {
      const { db } = await import("@shiplens/db");
      await Promise.race([
        db.execute({ sql: "SELECT 1" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
    } catch {
      dbStatus = "error";
    }

    try {
      const { connection } = await import("@shiplens/queue");
      await Promise.race([
        connection.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
    } catch {
      redisStatus = "error";
    }

    const overallStatus = dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded";

    const statusCode = overallStatus === "ok" ? 200 : 503;

    return reply.status(statusCode).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? "0.1.0",
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });

  fastify.get("/api/health/live", async (_request, reply) => {
    return reply.status(200).send({ status: "alive" });
  });

  fastify.get("/api/health/ready", async (_request, reply) => {
    try {
      const { db } = await import("@shiplens/db");
      await db.execute({ sql: "SELECT 1" });
      return reply.status(200).send({ status: "ready" });
    } catch {
      return reply.status(503).send({ status: "not ready" });
    }
  });
};
