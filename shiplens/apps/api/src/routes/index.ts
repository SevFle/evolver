import { type FastifyInstance, type FastifyPluginCallback } from "fastify";
import { healthRoutes } from "./health.js";
import { shipmentRoutes } from "./shipments.js";
import { milestoneRoutes } from "./milestones.js";
import { tenantRoutes } from "./tenants.js";
import { notificationRoutes } from "./notifications.js";
import { csvImportRoutes } from "./csv-import.js";
import { trackingPageRoutes } from "./tracking-pages.js";
import { apiKeyRoutes } from "./api-keys.js";

const routes: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.register(healthRoutes);

  fastify.addHook("onRequest", async (request, reply) => {
    const path = request.url;
    if (path.startsWith("/api/health")) return;

    const tenantSlug = request.headers["x-tenant-slug"];
    if (typeof tenantSlug === "string") {
      (request as any).tenantSlug = tenantSlug;
    }

    const apiKey = request.headers["x-api-key"];
    const authHeader = request.headers.authorization;

    if (!apiKey && !authHeader) {
      if (path.startsWith("/api/shipments") || path.startsWith("/api/milestones")) {
        return reply.status(401).send({ success: false, error: "Authentication required" });
      }
    }
  });

  fastify.addHook("onResponse", (request, reply, done) => {
    fastify.log.info(
      { method: request.method, url: request.url, statusCode: reply.statusCode, responseTime: reply.elapsedTime },
      "request completed",
    );
    done();
  });

  fastify.register(shipmentRoutes, { prefix: "/api/shipments" });
  fastify.register(milestoneRoutes, { prefix: "/api/milestones" });
  fastify.register(tenantRoutes, { prefix: "/api/tenants" });
  fastify.register(notificationRoutes, { prefix: "/api/notifications" });
  fastify.register(csvImportRoutes, { prefix: "/api/csv-import" });
  fastify.register(trackingPageRoutes, { prefix: "/api/tracking-pages" });
  fastify.register(apiKeyRoutes, { prefix: "/api/api-keys" });
};

export default routes;
