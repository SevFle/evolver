import type { FastifyInstance, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import crypto from "crypto";

declare module "fastify" {
  interface FastifyRequest {
    tenantId?: string;
  }
}

export async function auth(server: FastifyInstance) {
  server.addHook(
    "onRequest",
    (request: FastifyRequest, _reply: unknown, done: HookHandlerDoneFunction) => {
      const apiKey = request.headers["x-api-key"] as string | undefined;
      const authHeader = request.headers.authorization;

      if (request.url.startsWith("/api/health")) {
        return done();
      }

      if (apiKey) {
        const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
        request.tenantId = keyHash;
      } else if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        request.tenantId = token;
      }

      done();
    }
  );
}
