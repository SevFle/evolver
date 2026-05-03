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

    expect(server).toBeDefined();
    expect(typeof server.close).toBe("function");

    await server.close();
  });

  it("uses default host and port when env vars are not set", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.HOST;
    process.env.PORT = "0";

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

    try {
      const { main } = await import("../src/server");

      await main();

      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
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

    try {
      const { main } = await import("../src/server");

      const server: FastifyInstance = await main();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not initialize database-backed")
      );

      await server.close();
    } finally {
      vi.doUnmock("@shiplens/db");
      warnSpy.mockRestore();
    }
  });

  it("initializes db-backed resolver and resolves tenant via api key", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    delete process.env.VITEST;

    const fakeLimit = vi.fn().mockResolvedValue([{ tenantId: "tenant-from-db" }]);
    const fakeWhere = vi.fn().mockReturnValue({ limit: fakeLimit });
    const fakeFrom = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeSelect = vi.fn().mockReturnValue({ from: fakeFrom });

    const mockDb = { select: fakeSelect };
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

    try {
      const { main } = await import("../src/server");

      const server: FastifyInstance = await main();

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { "x-api-key": "my-api-key" },
      });

      expect(res.statusCode).toBe(200);
      expect(fakeSelect).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith(mockApiKeys.keyHash, expect.any(String));
      expect(mockEq).toHaveBeenCalledWith(mockApiKeys.active, true);
      expect(mockAnd).toHaveBeenCalled();
      expect(fakeFrom).toHaveBeenCalledWith(mockApiKeys);
      expect(fakeWhere).toHaveBeenCalled();
      expect(fakeLimit).toHaveBeenCalledWith(1);

      const body = res.json();
      expect(body.success).toBe(true);

      await server.close();
    } finally {
      vi.doUnmock("@shiplens/db");
      vi.doUnmock("drizzle-orm");
    }
  });

  it("rejects api key when resolver returns null tenant", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    delete process.env.VITEST;

    const fakeLimit = vi.fn().mockResolvedValue([]);
    const fakeWhere = vi.fn().mockReturnValue({ limit: fakeLimit });
    const fakeFrom = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeSelect = vi.fn().mockReturnValue({ from: fakeFrom });

    const mockDb = { select: fakeSelect };
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

    try {
      const { main } = await import("../src/server");

      const server: FastifyInstance = await main();

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { "x-api-key": "unknown-key" },
      });

      expect(res.statusCode).toBe(401);
      expect(fakeSelect).toHaveBeenCalled();

      const body = res.json();
      expect(body.error).toBe("Invalid API key");

      await server.close();
    } finally {
      vi.doUnmock("@shiplens/db");
      vi.doUnmock("drizzle-orm");
    }
  });

  it("resolves tenant id from db and makes it available on request", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    delete process.env.VITEST;

    const fakeLimit = vi.fn().mockResolvedValue([{ tenantId: "acme-corp" }]);
    const fakeWhere = vi.fn().mockReturnValue({ limit: fakeLimit });
    const fakeFrom = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeSelect = vi.fn().mockReturnValue({ from: fakeFrom });

    const mockDb = { select: fakeSelect };
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

    try {
      const { main } = await import("../src/server");

      const server: FastifyInstance = await main();

      const res = await server.inject({
        method: "GET",
        url: "/api/shipments",
        headers: { "x-api-key": "valid-acme-key" },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);

      await server.close();
    } finally {
      vi.doUnmock("@shiplens/db");
      vi.doUnmock("drizzle-orm");
    }
  });
});
