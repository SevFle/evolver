import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

async function securityHeaders(server: FastifyInstance) {
  server.addHook(
    "onSend",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("X-Frame-Options", "DENY");
      reply.header("X-XSS-Protection", "0");
      reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
      reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
      );

      if (process.env.NODE_ENV === "production") {
        reply.header(
          "Strict-Transport-Security",
          "max-age=63072000; includeSubDomains; preload"
        );
      }
    }
  );
}

export const securityHeadersPlugin = fp(securityHeaders, {
  name: "shiplens-security-headers",
});
