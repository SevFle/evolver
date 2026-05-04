import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { DEFAULT_SECRET } from "../helpers/auth";

describe("Security Headers Plugin", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("sets X-Content-Type-Options header", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options header", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-XSS-Protection header", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-xss-protection"]).toBe("0");
  });

  it("sets Referrer-Policy header", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets Permissions-Policy header", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("does not set Strict-Transport-Security in non-production", async () => {
    const res = await server.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("sets Strict-Transport-Security in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const prodServer = await buildServer();

    const res = await prodServer.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );

    await prodServer.close();
    delete process.env.NODE_ENV;
  });

  it("applies headers to error responses", async () => {
    const res = await server.inject({ method: "GET", url: "/api/shipments" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});
