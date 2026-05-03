import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server";

describe("Health endpoint", () => {
  it("GET /api/health returns health status", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("degraded");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("database");
    expect(body.services).toHaveProperty("redis");

    await server.close();
  });

  it("GET /api/health/live returns alive status", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health/live",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("alive");

    await server.close();
  });
});

describe("Shipment routes", () => {
  it("POST /api/shipments returns 401 without auth", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "POST",
      url: "/api/shipments",
      payload: { trackingId: "TEST-001" },
    });

    expect(response.statusCode).toBe(401);

    await server.close();
  });

  it("GET /api/shipments returns empty list", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/shipments",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    await server.close();
  });

  it("GET /api/shipments/:trackingId returns tracking data", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/shipments/TRACK-123",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.trackingId).toBe("TRACK-123");

    await server.close();
  });
});

describe("Error handling", () => {
  it("returns 404 for unknown routes", async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/unknown",
    });

    expect(response.statusCode).toBe(404);

    await server.close();
  });
});
