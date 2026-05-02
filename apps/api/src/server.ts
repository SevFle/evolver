import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { requestLogger } from "./plugins/request-logger";
import { auth } from "./plugins/auth";
import { tenantResolver } from "./plugins/tenant-resolver";
import { healthRoutes } from "./routes/health";
import { shipmentRoutes } from "./routes/shipments";
import { milestoneRoutes } from "./routes/milestones";
import { tenantRoutes } from "./routes/tenants";
import { notificationRoutes } from "./routes/notifications";
import { apiKeyRoutes } from "./routes/api-keys";
import { csvImportRoutes } from "./routes/csv-import";

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await server.register(cors, { origin: true });
  await server.register(sensible);
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await server.register(requestLogger);
  await server.register(auth);
  await server.register(tenantResolver);

  await server.register(healthRoutes, { prefix: "/api" });
  await server.register(shipmentRoutes, { prefix: "/api/shipments" });
  await server.register(milestoneRoutes, { prefix: "/api/milestones" });
  await server.register(tenantRoutes, { prefix: "/api/tenants" });
  await server.register(notificationRoutes, { prefix: "/api/notifications" });
  await server.register(apiKeyRoutes, { prefix: "/api/api-keys" });
  await server.register(csvImportRoutes, { prefix: "/api/csv-import" });

  return server;
}

async function main() {
  const server = await buildServer();

  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3001);

  try {
    await server.listen({ host, port });
    server.log.info(`ShipLens API listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
