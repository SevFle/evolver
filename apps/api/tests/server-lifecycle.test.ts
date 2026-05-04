import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildServer, validateEnvironment } from "../src/server";
import { authBearerHeader, DEFAULT_SECRET } from "./helpers/auth";

describe("Server Lifecycle", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
  });

  it("can build and close multiple servers sequentially", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;

    const server1 = await buildServer();
    const res1 = await server1.inject({ method: "GET", url: "/api/health" });
    expect(res1.statusCode).toBe(200);
    await server1.close();

    const server2 = await buildServer();
    const res2 = await server2.inject({ method: "GET", url: "/api/health" });
    expect(res2.statusCode).toBe(200);
    await server2.close();
  });

  it("server inject returns proper response shape for health", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer();

    const res = await server.inject({ method: "GET", url: "/api/health" });
    const body = res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(typeof body.version).toBe("string");

    await server.close();
  });

  it("handles concurrent requests", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer();

    const requests = Array.from({ length: 10 }, () =>
      server.inject({ method: "GET", url: "/api/health" })
    );
    const results = await Promise.all(requests);

    for (const res of results) {
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");
    }

    await server.close();
  });

  it("handles concurrent requests to protected routes", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer();
    const headers = authBearerHeader("tenant-1");

    const requests = Array.from({ length: 5 }, () =>
      server.inject({ method: "GET", url: "/api/tenants/current", headers })
    );
    const results = await Promise.all(requests);

    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    await server.close();
  });

  it("returns proper content-type for JSON responses", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer();

    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["content-type"]).toContain("application/json");

    await server.close();
  });

  it("version falls back to 0.0.1 when npm_package_version not set", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    delete process.env.npm_package_version;
    const server = await buildServer();

    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.json().version).toBe("0.0.1");

    await server.close();
  });

  it("version uses npm_package_version when set", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    process.env.npm_package_version = "2.5.0";
    const server = await buildServer();

    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.json().version).toBe("2.5.0");

    await server.close();
  });
});

describe("validateEnvironment edge cases", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not throw in staging-like env when JWT_SECRET is set", async () => {
    process.env.JWT_SECRET = "staging-secret";
    process.env.NODE_ENV = "staging";

    const { validateEnvironment: ve } = await import("../src/server");
    expect(() => ve()).not.toThrow();
    expect(process.env.JWT_SECRET).toBe("staging-secret");
  });

  it("generates secret in staging when not set", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "staging";

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { validateEnvironment: ve } = await import("../src/server");
    expect(() => ve()).not.toThrow();
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(64);
  });
});
