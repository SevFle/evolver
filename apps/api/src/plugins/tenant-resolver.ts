import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

async function tenantResolver(server: FastifyInstance) {
  server.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host ?? "";
    const subdomain = host.split(".")[0];

    if (subdomain && subdomain !== "www" && subdomain !== "api") {
      request.tenantId = request.tenantId ?? subdomain;
    }
  });
}

export const tenantResolverPlugin = fp(tenantResolver, { name: "shiplens-tenant-resolver" });
