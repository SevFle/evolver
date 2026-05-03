import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { tenantResolverPlugin } from "../../src/plugins/tenant-resolver";

describe("tenantResolver plugin", () => {
  let server: Awaited<ReturnType<typeof Fastify>>;

  beforeEach(async () => {
    server = Fastify();
    await server.register(tenantResolverPlugin);
    server.get("/test", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));
  });

  afterEach(async () => {
    await server.close();
  });

  it("extracts tenant from subdomain", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { host: "acme.shiplens.io" },
    });

    expect(res.json().tenantId).toBe("acme");
  });

  it("does not set tenantId for www subdomain", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { host: "www.shiplens.io" },
    });

    expect(res.json().tenantId).toBeNull();
  });

  it("does not set tenantId for api subdomain", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { host: "api.shiplens.io" },
    });

    expect(res.json().tenantId).toBeNull();
  });

  it("treats localhost as a subdomain when host defaults", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.json().tenantId).toBe("localhost:80");
  });

  it("does not overwrite existing tenantId from auth", async () => {
    server.addHook("onRequest", async (request) => {
      request.tenantId = "existing-tenant";
    });

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { host: "acme.shiplens.io" },
    });

    expect(res.json().tenantId).toBe("existing-tenant");
  });

  it("handles undefined host header gracefully", async () => {
    const testServer = Fastify();
    testServer.addHook("onRequest", async (request) => {
      request.headers.host = undefined as unknown as string;
    });
    await testServer.register(tenantResolverPlugin);
    testServer.get("/test", async (request) => ({
      tenantId: request.tenantId ?? null,
    }));

    const res = await testServer.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.json().tenantId).toBeNull();
    await testServer.close();
  });
});
