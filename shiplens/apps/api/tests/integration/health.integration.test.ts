import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Health endpoint integration", () => {
  it("GET /api/health reflects service statuses", async () => {
    const { buildServer } = await import("../src/server");
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();
    expect(body).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(body.status);
    expect(body.services).toHaveProperty("database");
    expect(body.services).toHaveProperty("redis");

    await server.close();
  });
});
