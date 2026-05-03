import { test, expect } from "@playwright/test";

test.describe("API Health endpoints", () => {
  test("GET /api/health returns status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("services");
  });

  test("GET /api/health/live returns alive", async ({ request }) => {
    const response = await request.get("/api/health/live");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.status).toBe("alive");
  });
});
