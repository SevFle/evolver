import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const tenantResolverPlugin: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", async (request, _reply) => {
    const path = request.url;
    if (path.startsWith("/api/health")) return;

    const tenantSlug = request.headers["x-tenant-slug"];
    if (typeof tenantSlug === "string") {
      request.tenantSlug = tenantSlug;
    }
  });
};

declare module "fastify" {
  interface FastifyRequest {
    tenantSlug?: string;
  }
}
