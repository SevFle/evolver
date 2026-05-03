import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServer } from "../../src/server";
import { authBearerHeader, DEFAULT_SECRET, createCsrfToken } from "../helpers/auth";
import { hashApiKey } from "../../src/plugins/auth";

const mockResolver = async (keyHash: string) => {
  if (keyHash === hashApiKey("valid-key")) return "tenant-csv";
  return null;
};

describe("CSV Import Routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    server = await buildServer({ apiKeyResolver: mockResolver });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("POST /api/csv-import", () => {
    it("returns 202 with queued message", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/csv-import",
        payload: {},
        headers: { ...authBearerHeader("t1"), "x-csrf-token": createCsrfToken() },
      });
      expect(res.statusCode).toBe(202);
      expect(res.json().success).toBe(true);
      expect(res.json().message).toBe("CSV import queued");
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/csv-import",
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/csv-import/:jobId/status", () => {
    it("returns job status with matching jobId", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/csv-import/job-123/status",
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.jobId).toBe("job-123");
      expect(body.data.status).toBe("pending");
    });

    it("handles UUID-format job IDs", async () => {
      const jobId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await server.inject({
        method: "GET",
        url: `/api/csv-import/${jobId}/status`,
        headers: authBearerHeader("t1"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.jobId).toBe(jobId);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/csv-import/job-123/status",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
