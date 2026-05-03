import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { hashApiKey } from "../src/plugins/auth";

describe("main() – production startup", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("starts the server and logs the listening message", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    expect(server).toBeDefined();
    expect(typeof server.close).toBe("function");

    await server.close();
  });

  it("uses default host and port when env vars are not set", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.HOST;
    delete process.env.PORT;

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    await server.close();
  });

  it("exits with code 1 when server.listen fails", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "-1";

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const { main } = await import("../src/server");

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("warns when database resolver cannot be initialized", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("@shiplens/db", () => ({
      get db() {
        throw new Error("Connection refused");
      },
      apiKeys: {
        tenantId: "tenant_id",
        keyHash: "key_hash",
        active: "active",
      },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: (col: string, val: string) => ({ col, val}),
      and: (...args: unknown[]) => args,
    }));

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not initialize database-backed")
    );

    await server.close();
    vi.doUnmock("@shiplens/db");
    vi.doUnmock("drizzle-orm");
    warnSpy.mockRestore();
  });

  it("initializes db-backed resolver and resolves tenant via api key", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const fakeLimit = vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]);
    const fakeWhere = vi.fn().mockReturnValue({ limit: fakeLimit });
    const fakeFrom = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeSelect = vi.fn().mockReturnValue({ from: fakeFrom });

    const mockDb = {
      select: fakeSelect,
    };
    const mockApiKeys = {
      tenantId: "tenant_id",
      keyHash: "key_hash",
      active: "active",
    };
    const mockEq = vi.fn((col: string, val: string) => ({ col, val }));
    const mockAnd = vi.fn((...args: unknown[]) => args);

    vi.doMock("@shiplens/db", () => ({
      db: mockDb,
      apiKeys: mockApiKeys,
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: mockEq,
      and: mockAnd,
    }));

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: { "x-api-key": "my-api-key" },
    });

    expect(res.statusCode).toBe(200);
    expect(fakeSelect).toHaveBeenCalled();

    await server.close();
    vi.doUnmock("@shiplens/db");
    vi.doUnmock("drizzle-orm");
  });

  it("resolver returns null when no matching api key found", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const fakeLimit = vi.fn().mockResolvedValue([]);
    const fakeWhere = vi.fn().mockReturnValue({ limit: fakeLimit });
    const fakeFrom = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeSelect = vi.fn().mockReturnValue({ from: fakeFrom });

    const mockDb = {
      select: fakeSelect,
    };
    const mockApiKeys = {
      tenantId: "tenant_id",
      keyHash: "key_hash",
      active: "active",
    };
    const mockEq = vi.fn((col: string, val: string) => ({ col, val }));
    const mockAnd = vi.fn((...args: unknown[]) => args);

    vi.doMock("@shiplens/db", () => ({
      db: mockDb,
      apiKeys: mockApiKeys,
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: mockEq,
      and: mockAnd,
    }));

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    const res = await server.inject({
      method: "GET",
      url: "/api/shipments",
      headers: { "x-api-key": "unknown-key" },
    });

    expect(res.statusCode).toBe(401);
    expect(fakeSelect).toHaveBeenCalled();

    await server.close();
    vi.doUnmock("@shiplens/db");
    vi.doUnmock("drizzle-orm");
  });

  it("skips db init and listening when skipAutoStart is true", async () => {
    process.env.JWT_SECRET = "test-secret";

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main({ skipAutoStart: true });

    expect(server).toBeDefined();
    expect(typeof server.close).toBe("function");

    const res = await server.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.statusCode).toBe(200);

    await server.close();
  });
});
