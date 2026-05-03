import { describe, it, expect } from "vitest";

describe("tenant-resolver", () => {
  it("extracts tenant from subdomain", async () => {
    const mod = await import("../src/lib/tenant-resolver");
    const tenant = mod.resolveTenant("acme.trackshiplens.com", "/");
    expect(tenant).toBe("acme");
  });

  it("extracts tenant from path", async () => {
    const mod = await import("../src/lib/tenant-resolver");
    const tenant = mod.resolveTenant(null, "/t/acme-logistics/TRACK-123");
    expect(tenant).toBe("acme-logistics");
  });

  it("returns null when no tenant found", async () => {
    const mod = await import("../src/lib/tenant-resolver");
    const tenant = mod.resolveTenant("localhost:3000", "/TRACK-123");
    expect(tenant).toBeNull();
  });
});
