import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { rateLimiterPlugin } from "../../src/plugins/rate-limiter";

describe("rateLimiter plugin", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    await server.register(rateLimiterPlugin);
    server.get("/test", async () => ({ ok: true }));
  });

  afterEach(async () => {
    await server.close();
  });

  it("allows requests under the rate limit", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("includes rate limit headers in responses", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers).toHaveProperty("x-ratelimit-limit");
    expect(res.headers).toHaveProperty("x-ratelimit-remaining");
  });

  it("sets rate limit max to 100", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.headers["x-ratelimit-limit"]).toBe("100");
  });
});
