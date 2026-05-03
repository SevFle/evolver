import { type FastifyInstance, type FastifyPluginCallback } from "fastify";

export const requestLoggerPlugin: FastifyPluginCallback = async (fastify: FastifyInstance) => {
  fastify.addHook("onResponse", (request, reply, done) => {
    fastify.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
    done();
  });
};
