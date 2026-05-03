import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, apiKeyHeader, DEFAULT_SECRET } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-ten";
  return null;
};

describe("Tenant Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/tenants/current", () => {
    it("returns tenant info from JWT", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: authBearerHeader("my-tenant-id"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.tenantId).toBe("my-tenant-id");
    });

    it("returns tenant info from API key", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
        headers: apiKeyHeader("valid-key"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tenantId).toBe("tenant-ten");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tenants/current",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/tenants/current", () => {
    it("updates tenant", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: { name: "Updated Corp", primaryColor: "#FF0000" },
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe("Tenant updated");
    });

    it("accepts empty payload", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/tenants/current",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
