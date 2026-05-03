import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

async function requestLogger(server: FastifyInstance) {
  server.addHook("onResponse", (request, reply, done) => {
    server.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        tenantId: request.tenantId,
      },
      "request completed"
    );
    done();
  });
}

export const requestLoggerPlugin = fp(requestLogger, { name: "shiplens-request-logger" });
