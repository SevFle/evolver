import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import crypto from "crypto";
import { rateLimiterPlugin } from "./plugins/rate-limiter";
import { requestLoggerPlugin } from "./plugins/request-logger";
import { authPlugin } from "./plugins/auth";
import type { ApiKeyResolver } from "./plugins/auth";
import { tenantResolverPlugin } from "./plugins/tenant-resolver";
import { healthRoutes } from "./routes/health";
import { shipmentRoutes } from "./routes/shipments";
import { milestoneRoutes } from "./routes/milestones";
import { tenantRoutes } from "./routes/tenants";
import { notificationRoutes } from "./routes/notifications";
import { apiKeyRoutes } from "./routes/api-keys";
import { csvImportRoutes } from "./routes/csv-import";
import { trackingPageRoutes } from "./routes/tracking-pages";

export interface ServerOptions {
  apiKeyResolver?: ApiKeyResolver;
}

export function validateEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === "") {
    if (isProduction) {
      throw new Error(
        "FATAL: JWT_SECRET environment variable is required in production. " +
          "Set it to a high-entropy random string (e.g. openssl rand -hex 32)."
      );
    }

    const generated = crypto.randomBytes(32).toString("hex");
    process.env.JWT_SECRET = generated;
    console.warn(
      `[WARN] JWT_SECRET not set. A random secret has been generated for ${nodeEnv} use. ` +
        "Do NOT use this in production — set the JWT_SECRET environment variable."
    );
  }
}

export async function buildServer(options?: ServerOptions) {
  validateEnvironment();

  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await server.register(cors, { origin: true });
  await server.register(sensible);
  await server.register(rateLimiterPlugin);

  await server.register(requestLoggerPlugin);
  await server.register(authPlugin, {
    apiKeyResolver: options?.apiKeyResolver,
  });
  await server.register(tenantResolverPlugin);

  await server.register(healthRoutes, { prefix: "/api" });
  await server.register(shipmentRoutes, { prefix: "/api/shipments" });
  await server.register(milestoneRoutes, { prefix: "/api/milestones" });
  await server.register(tenantRoutes, { prefix: "/api/tenants" });
  await server.register(notificationRoutes, { prefix: "/api/notifications" });
  await server.register(apiKeyRoutes, { prefix: "/api/api-keys" });
  await server.register(csvImportRoutes, { prefix: "/api/csv-import" });
  await server.register(trackingPageRoutes, { prefix: "/api/tracking-pages" });

  return server;
}

export async function main() {
  let resolver: ApiKeyResolver | undefined;

  if (!process.env.VITEST) {
    try {
      const { db } = await import("@shiplens/db");
      const { apiKeys } = await import("@shiplens/db");
      const { eq, and } = await import("drizzle-orm");

      resolver = async (keyHash: string) => {
        const rows = await db
          .select({ tenantId: apiKeys.tenantId })
          .from(apiKeys)
          .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.active, true)))
          .limit(1);
        return rows[0]?.tenantId ?? null;
      };
    } catch {
      console.warn(
        "[WARN] Could not initialize database-backed API key resolver. API key authentication will not be available."
      );
    }
  }

  const server = await buildServer({ apiKeyResolver: resolver });

  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? 3001);

  try {
    await server.listen({ host, port });
    server.log.info(`ShipLens API listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  return server;
}

/* v8 ignore next 3 */
if (!process.env.VITEST) {
  main();
}
