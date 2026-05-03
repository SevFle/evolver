import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

describe("main() – production startup", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("starts the server and logs the listening message", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    try {
      expect(server).toBeDefined();
      expect(typeof server.close).toBe("function");
    } finally {
      await server.close();
    }
  });

  it("uses default host and port when env vars are not set", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.HOST;
    process.env.PORT = "0";

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    try {
      expect(server).toBeDefined();
    } finally {
      await server.close();
    }
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
    delete process.env.VITEST;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("@shiplens/db", () => {
      throw new Error("no db module");
    });

    const { main } = await import("../src/server");

    const server: FastifyInstance = await main();

    try {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not initialize database-backed")
      );
    } finally {
      await server.close();
      vi.doUnmock("@shiplens/db");
      warnSpy.mockRestore();
    }
  });

  it("initializes db-backed resolver and resolves tenant via api key", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    delete process.env.VITEST;

    const fakeSelect = vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]);
    const fakeFrom = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]) }) });
    const fakeWhere = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]) });
    const fakeLimit = vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]);

    fakeFrom.mockReturnValue({ where: fakeWhere });
    fakeWhere.mockReturnValue({ limit: fakeLimit });
    fakeSelect.mockReturnValue({ from: fakeFrom });

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

    try {
      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { "x-api-key": "my-api-key" },
      });

      expect(res.statusCode).toBe(200);
      expect(fakeSelect).toHaveBeenCalled();
    } finally {
      await server.close();
      vi.doUnmock("@shiplens/db");
      vi.doUnmock("drizzle-orm");
    }
  });
});
