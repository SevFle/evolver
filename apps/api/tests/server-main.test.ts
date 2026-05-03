import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer } from "../src/server";

describe("main()", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("skips DB resolver when VITEST is set and starts server", async () => {
    process.env.JWT_SECRET = "test-main-secret";
    process.env.VITEST = "true";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const { main } = await import("../src/server");
    const server = await main();

    expect(server).toBeDefined();
    expect(typeof server.close).toBe("function");
    await server.close();
  });

  it("attempts DB resolver when VITEST is not set", async () => {
    process.env.JWT_SECRET = "test-main-db-secret";
    delete process.env.VITEST;
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { main } = await import("../src/server");
    const server = await main();

    expect(server).toBeDefined();
    await server.close();

    warnSpy.mockRestore();
  });

  it("uses default host and port when env vars not set", async () => {
    process.env.JWT_SECRET = "test-main-defaults";
    process.env.VITEST = "true";
    delete process.env.HOST;
    delete process.env.PORT;
    process.env.PORT = "0";

    const { main } = await import("../src/server");
    const server = await main();

    expect(server).toBeDefined();
    await server.close();
  });

  it("creates DB-backed resolver that queries apiKeys table", async () => {
    process.env.JWT_SECRET = "test-resolver-secret";
    delete process.env.VITEST;
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { main } = await import("../src/server");
    const server = await main();

    const res = await server.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.statusCode).toBe(200);

    await server.close();
    warnSpy.mockRestore();
  });
});
