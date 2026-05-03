import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("server module-level guard and error paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, JWT_SECRET: "guard-test-secret" };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("calls main() automatically when VITEST is not set (module guard)", async () => {
    const mockListen = vi.fn().mockResolvedValue(undefined);
    const mockLogInfo = vi.fn();

    vi.doMock("fastify", () => ({
      default: vi.fn(() => ({
        register: vi.fn().mockResolvedValue(undefined),
        listen: mockListen,
        log: { info: mockLogInfo, error: vi.fn() },
        close: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock("@shiplens/db", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ tenantId: "t1" }]),
            })),
          })),
        })),
      },
      apiKeys: { tenantId: "tenantId", keyHash: "keyHash", active: "active" },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: () => ({}),
      and: () => ({}),
    }));

    delete process.env.VITEST;
    process.env.HOST = "0.0.0.0";
    process.env.PORT = "3001";

    await import("../src/server");

    await new Promise((r) => setTimeout(r, 100));

    expect(mockListen).toHaveBeenCalledWith({ host: "0.0.0.0", port: 3001 });
    expect(mockLogInfo).toHaveBeenCalledWith(
      "ShipLens API listening on 0.0.0.0:3001"
    );
  });

  it("does not call main() when VITEST is set", async () => {
    const mockListen = vi.fn();

    vi.doMock("fastify", () => ({
      default: vi.fn(() => ({
        register: vi.fn().mockResolvedValue(undefined),
        listen: mockListen,
        log: { info: vi.fn(), error: vi.fn() },
        close: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    process.env.VITEST = "true";

    await import("../src/server");

    await new Promise((r) => setTimeout(r, 50));

    expect(mockListen).not.toHaveBeenCalled();
  });

  it("logs error and calls process.exit(1) when listen fails", async () => {
    const listenError = new Error("listen EADDRINUSE");
    const mockLogError = vi.fn();

    vi.doMock("fastify", () => ({
      default: vi.fn(() => ({
        register: vi.fn().mockResolvedValue(undefined),
        listen: vi.fn().mockRejectedValue(listenError),
        log: { info: vi.fn(), error: mockLogError },
        close: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock("@shiplens/db", () => ({
      db: {},
      apiKeys: {},
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: () => ({}),
      and: () => ({}),
    }));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    delete process.env.VITEST;

    await import("../src/server");

    await new Promise((r) => setTimeout(r, 100));

    expect(mockLogError).toHaveBeenCalledWith(listenError);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
