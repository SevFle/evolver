import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { DEFAULT_SECRET } from "../helpers/auth";

describe("Tracking Page Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /api/tracking-pages/:trackingId", () => {
    it("returns tracking data without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/TRK-12345",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.trackingId).toBe("TRK-12345");
    });

    it("handles special characters in tracking ID", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/SL-ABC-2024",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("SL-ABC-2024");
    });

    it("handles URL-encoded tracking IDs", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/TRK%20123",
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles numeric-only tracking IDs", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/123456789",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.trackingId).toBe("123456789");
    });

    it("does not require authentication (public route)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/ANY-ID",
      });
      expect(res.statusCode).toBe(200);
    });

    it("still works even if auth headers are provided", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/tracking-pages/TRK-999",
        headers: { authorization: "Bearer some-token" },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
