import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("validateEnvironment (JWT_SECRET)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws in production when JWT_SECRET is not set", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";

    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).toThrow(
      /JWT_SECRET environment variable is required in production/
    );
  });

  it("throws in production when JWT_SECRET is empty string", async () => {
    process.env.JWT_SECRET = "";
    process.env.NODE_ENV = "production";

    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).toThrow(
      /JWT_SECRET environment variable is required in production/
    );
  });

  it("does not throw in production when JWT_SECRET is set", async () => {
    process.env.JWT_SECRET = "a-real-production-secret-32chars!!";
    process.env.NODE_ENV = "production";

    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBe("a-real-production-secret-32chars!!");
  });

  it("generates a random JWT_SECRET in development when not set", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(64);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("JWT_SECRET not set")
    );
  });

  it("generates a random JWT_SECRET in test mode when not set", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(64);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("JWT_SECRET not set")
    );
  });

  it("preserves existing JWT_SECRET when already set", async () => {
    process.env.JWT_SECRET = "my-existing-secret";
    process.env.NODE_ENV = "development";

    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBe("my-existing-secret");
  });

  it("generates different secrets on each call", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment } = await import("../../src/server");
    validateEnvironment();
    const first = process.env.JWT_SECRET;

    delete process.env.JWT_SECRET;
    validateEnvironment();
    const second = process.env.JWT_SECRET;

    expect(first).not.toBe(second);
  });

  it("throws in production when JWT_SECRET is whitespace-only", async () => {
    process.env.JWT_SECRET = "   ";
    process.env.NODE_ENV = "production";

    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).toThrow(
      /JWT_SECRET environment variable is required in production/
    );
  });

  it("generates a random JWT_SECRET in development when set to whitespace", async () => {
    process.env.JWT_SECRET = "   ";
    process.env.NODE_ENV = "development";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(64);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("JWT_SECRET not set")
    );
  });

  it("treats undefined NODE_ENV as development", async () => {
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment } = await import("../../src/server");
    expect(() => validateEnvironment()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
