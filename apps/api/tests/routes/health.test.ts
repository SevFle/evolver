import { describe, it, expect } from "vitest";
import { buildServer } from "../../src/server";

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");

    await server.close();
  });

  it("includes a valid ISO timestamp", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = response.json();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await server.close();
  });
});
