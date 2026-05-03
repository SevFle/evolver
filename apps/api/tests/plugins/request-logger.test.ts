import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { requestLoggerPlugin } from "../../src/plugins/request-logger";

describe("requestLogger plugin", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    await server.register(requestLoggerPlugin);
    server.get("/test", async () => ({ ok: true }));
  });

  afterEach(async () => {
    await server.close();
  });

  it("allows requests to complete normally", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("attaches onResponse hook without error", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(200);
  });

  it("handles 404 routes gracefully", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });
});
