import { test, expect } from "@playwright/test";

test.describe("API Health Endpoint", () => {
  test("GET /api/health returns 200 with status ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
  });

  test("GET /api/health returns a valid ISO timestamp", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});
