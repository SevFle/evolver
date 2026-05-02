import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import { config } from "@shiplens/config";
import routes from "./routes/index.js";

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: config.isProd ? "info" : "debug",
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  await server.register(helmet);
  await server.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Tenant-Slug"],
  });
  await server.register(sensible);

  server.setErrorHandler((error, _request, reply) => {
    server.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      success: false,
      error: error.message ?? "Internal Server Error",
    });
  });

  server.register(routes);

  return server;
}

export async function startServer() {
  const server = await buildServer();

  try {
    await server.listen({ port: config.api.port, host: config.api.host });
    server.log.info(`ShipLens API running on ${config.api.host}:${config.api.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    server.log.info("Shutting down gracefully...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  startServer();
}
