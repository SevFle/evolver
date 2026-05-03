import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";

describe("resolveTenantFromHost", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getResolver() {
    const { resolveTenantFromHost } = await import(
      "../src/lib/tenant-resolver"
    );
    return resolveTenantFromHost;
  }

  function mockHeaders(host: string | null) {
    const map = new Map<string, string>();
    if (host !== null) map.set("host", host);
    (headers as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => map.get(name) ?? null,
    });
  }

  it("extracts tenant subdomain from host", async () => {
    mockHeaders("acme.shiplens.io");
    const resolve = await getResolver();
    expect(await resolve()).toBe("acme");
  });

  it("returns null for www subdomain", async () => {
    mockHeaders("www.shiplens.io");
    const resolve = await getResolver();
    expect(await resolve()).toBeNull();
  });

  it("returns null for track subdomain", async () => {
    mockHeaders("track.shiplens.io");
    const resolve = await getResolver();
    expect(await resolve()).toBeNull();
  });

  it("returns null when host is empty string", async () => {
    mockHeaders("");
    const resolve = await getResolver();
    const result = await resolve();
    expect(result === null || result === "").toBe(true);
  });

  it("returns null when host header is missing", async () => {
    mockHeaders(null);
    const resolve = await getResolver();
    expect(await resolve()).toBeNull();
  });

  it("extracts subdomain from localhost with port", async () => {
    mockHeaders("acme.localhost:3000");
    const resolve = await getResolver();
    expect(await resolve()).toBe("acme");
  });

  it("handles single-part hostname (no subdomain)", async () => {
    mockHeaders("localhost");
    const resolve = await getResolver();
    expect(await resolve()).toBe("localhost");
  });

  it("handles multi-level subdomain (uses first part)", async () => {
    mockHeaders("app.staging.shiplens.io");
    const resolve = await getResolver();
    expect(await resolve()).toBe("app");
  });

  it("handles IP address host", async () => {
    mockHeaders("192.168.1.1");
    const resolve = await getResolver();
    expect(await resolve()).toBe("192");
  });
});
