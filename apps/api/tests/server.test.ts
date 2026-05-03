import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../src/server";
import { authBearerHeader, DEFAULT_SECRET } from "./helpers/auth";
import { hashApiKey } from "../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("test-key")) return "tenant-xyz";
  return null;
};

describe("buildServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = originalEnv;
  });

  it("returns a Fastify instance with JWT_SECRET set", async () => {
    process.env.JWT_SECRET = "test-secret";
    const server = await buildServer({ apiKeyResolver: mockResolver });
    expect(server).toBeDefined();
    expect(typeof server.inject).toBe("function");
    await server.close();
  });

  it("auto-generates JWT_SECRET in test mode", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";

    const server = await buildServer({ apiKeyResolver: mockResolver });
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET!.length).toBeGreaterThan(0);
    await server.close();
  });

  it("throws when JWT_SECRET is missing in production", async () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";

    await expect(buildServer()).rejects.toThrow(
      /JWT_SECRET environment variable is required in production/
    );
  });

  it("server responds to injected requests", async () => {
    process.env.JWT_SECRET = "test-secret";
    const server = await buildServer({ apiKeyResolver: mockResolver });

    const res = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it("registers all route prefixes with proper auth", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer({ apiKeyResolver: mockResolver });

    const headers = authBearerHeader("tenant-test");

    const getUrlChecks = [
      [200, "/api/health"],
      [200, "/api/shipments", headers],
      [200, "/api/milestones/shipment/s1", headers],
      [200, "/api/tenants/current", headers],
      [200, "/api/notifications/rules", headers],
      [200, "/api/api-keys", headers],
      [200, "/api/tracking-pages/TRK-1"],
    ] as const;

    for (const [expectedStatus, url, hdrs] of getUrlChecks) {
      const res = await server.inject({
        method: "GET",
        url,
        headers: hdrs as Record<string, string> | undefined,
      });
      expect(res.statusCode).toBe(expectedStatus);
    }

    await server.close();
  });

  it("returns 401 for protected routes without auth", async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const server = await buildServer({ apiKeyResolver: mockResolver });

    const protectedUrls = [
      "/api/shipments",
      "/api/milestones/shipment/s1",
      "/api/tenants/current",
      "/api/notifications/rules",
      "/api/api-keys",
    ];

    for (const url of protectedUrls) {
      const res = await server.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }

    await server.close();
  });
});
