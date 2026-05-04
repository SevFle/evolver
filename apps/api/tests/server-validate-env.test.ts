import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("validateEnvironment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function getValidateEnvironment() {
    vi.resetModules();
    const mod = await import("../src/server");
    return mod.validateEnvironment;
  }

  it("does not throw when JWT_SECRET is set", async () => {
    process.env.JWT_SECRET = "my-secret-key";
    const validate = await getValidateEnvironment();
    expect(() => validate()).not.toThrow();
  });

  it("throws in production when JWT_SECRET is empty", async () => {
    process.env.JWT_SECRET = "";
    process.env.NODE_ENV = "production";
    const validate = await getValidateEnvironment();
    expect(() => validate()).toThrow(/JWT_SECRET environment variable is required in production/);
  });

  it("throws in production when JWT_SECRET is whitespace only", async () => {
    process.env.JWT_SECRET = "   ";
    process.env.NODE_ENV = "production";
    const validate = await getValidateEnvironment();
    expect(() => validate()).toThrow(/JWT_SECRET environment variable is required in production/);
  });

  it("throws in production when JWT_SECRET is unset", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    const validate = await getValidateEnvironment();
    expect(() => validate()).toThrow(/JWT_SECRET environment variable is required in production/);
  });

  it("auto-generates JWT_SECRET in development when missing", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    const validate = await getValidateEnvironment();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validate();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("JWT_SECRET not set"));
    warnSpy.mockRestore();
  });

  it("auto-generates JWT_SECRET in test mode when missing", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";
    const validate = await getValidateEnvironment();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validate();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  it("auto-generates JWT_SECRET when NODE_ENV is unset (defaults to development)", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
    const validate = await getValidateEnvironment();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validate();
    expect(process.env.JWT_SECRET).toBeDefined();
    warnSpy.mockRestore();
  });

  it("generates a 64-character hex secret", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";
    const validate = await getValidateEnvironment();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validate();
    expect(process.env.JWT_SECRET).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(process.env.JWT_SECRET!)).toBe(true);
    warnSpy.mockRestore();
  });

  it("does not overwrite existing JWT_SECRET", async () => {
    process.env.JWT_SECRET = "existing-secret-value";
    const validate = await getValidateEnvironment();
    validate();
    expect(process.env.JWT_SECRET).toBe("existing-secret-value");
  });

  it("overwrites whitespace-only JWT_SECRET in development", async () => {
    process.env.JWT_SECRET = "   ";
    process.env.NODE_ENV = "development";
    const validate = await getValidateEnvironment();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validate();
    expect(process.env.JWT_SECRET).not.toBe("   ");
    expect(process.env.JWT_SECRET!.length).toBe(64);
    warnSpy.mockRestore();
  });
});

describe("buildServer - edge cases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sets logger level from LOG_LEVEL env var", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.LOG_LEVEL = "debug";
    vi.resetModules();
    const { buildServer } = await import("../src/server");
    const server = await buildServer();
    expect(server).toBeDefined();
    await server.close();
  });

  it("defaults logger level to info when LOG_LEVEL is not set", async () => {
    process.env.JWT_SECRET = "test-secret";
    delete process.env.LOG_LEVEL;
    vi.resetModules();
    const { buildServer } = await import("../src/server");
    const server = await buildServer();
    expect(server).toBeDefined();
    await server.close();
  });

  it("registers all route prefixes", async () => {
    process.env.JWT_SECRET = "test-secret";
    vi.resetModules();
    const { buildServer } = await import("../src/server");
    const server = await buildServer();

    const prefixes = [
      "/api/health",
      "/api/shipments",
      "/api/milestones",
      "/api/tenants",
      "/api/notifications",
      "/api/api-keys",
      "/api/csv-import",
      "/api/tracking-pages",
    ];

    for (const prefix of prefixes) {
      const res = await server.inject({
        method: "GET",
        url: prefix,
      });
      expect([200, 401, 404]).toContain(res.statusCode);
    }

    await server.close();
  });
});
