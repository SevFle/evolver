import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedisInstance = {
  on: vi.fn().mockReturnThis(),
  disconnect: vi.fn(),
  quit: vi.fn().mockResolvedValue("OK"),
};

vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => mockRedisInstance),
  };
});

import Redis from "ioredis";

describe("redis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.REDIS_URL;
  });

  it("creates Redis with default config when REDIS_URL is not set", async () => {
    const { getRedis } = await import("@/server/redis");
    getRedis();

    expect(Redis).toHaveBeenCalledWith({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: 3,
    });
  });

  it("passes REDIS_URL directly to Redis constructor", async () => {
    process.env.REDIS_URL = "redis://:secret@myhost:6380/0";
    const { getRedis } = await import("@/server/redis");
    getRedis();

    expect(Redis).toHaveBeenCalledWith(
      "redis://:secret@myhost:6380/0",
      { maxRetriesPerRequest: 3 },
    );
  });

  it("enables TLS for rediss:// URLs with rejectUnauthorized and servername", async () => {
    process.env.REDIS_URL = "rediss://:secret@tls-host:6380/0";
    const { getRedis } = await import("@/server/redis");
    getRedis();

    expect(Redis).toHaveBeenCalledWith(
      "rediss://:secret@tls-host:6380/0",
      { maxRetriesPerRequest: 3, tls: { rejectUnauthorized: true, servername: "tls-host" } },
    );
  });

  it("does not enable TLS for redis:// URLs", async () => {
    process.env.REDIS_URL = "redis://:secret@myhost:6380/0";
    const { getRedis } = await import("@/server/redis");
    getRedis();

    expect(Redis).toHaveBeenCalledWith(
      "redis://:secret@myhost:6380/0",
      { maxRetriesPerRequest: 3 },
    );
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    const { getRedis } = await import("@/server/redis");
    const first = getRedis();
    const second = getRedis();

    expect(first).toBe(second);
    expect(Redis).toHaveBeenCalledTimes(1);
  });

  it("registers an error handler on the Redis client", async () => {
    const { getRedis } = await import("@/server/redis");
    getRedis();

    expect(mockRedisInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("error handler logs error message to console", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getRedis } = await import("@/server/redis");
    getRedis();

    const errorHandler = mockRedisInstance.on.mock.calls.find(
      (c: unknown[]) => c[0] === "error",
    )?.[1] as (err: Error) => void;
    errorHandler(new Error("ECONNREFUSED"));

    expect(consoleErrorSpy).toHaveBeenCalledWith("Redis connection error:", "ECONNREFUSED");
    consoleErrorSpy.mockRestore();
  });

  describe("closeRedis", () => {
    it("calls quit and nulls the reference", async () => {
      const { getRedis, closeRedis } = await import("@/server/redis");
      getRedis();
      expect(Redis).toHaveBeenCalledTimes(1);

      await closeRedis();

      expect(mockRedisInstance.quit).toHaveBeenCalled();

      getRedis();
      expect(Redis).toHaveBeenCalledTimes(2);
    });

    it("does nothing when no client exists", async () => {
      const { closeRedis } = await import("@/server/redis");
      await closeRedis();
      expect(mockRedisInstance.quit).not.toHaveBeenCalled();
    });

    it("falls back to disconnect when quit throws", async () => {
      mockRedisInstance.quit.mockRejectedValueOnce(new Error("quit failed"));
      const { getRedis, closeRedis } = await import("@/server/redis");
      getRedis();

      await closeRedis();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();

      getRedis();
      expect(Redis).toHaveBeenCalledTimes(2);
    });

    it("nulls the reference even when quit throws and disconnect is called", async () => {
      mockRedisInstance.quit.mockRejectedValueOnce(new Error("quit failed"));
      const { getRedis, closeRedis } = await import("@/server/redis");
      getRedis();

      await closeRedis();

      getRedis();
      expect(Redis).toHaveBeenCalledTimes(2);
    });
  });
});
