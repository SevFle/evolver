import { test, expect } from "@playwright/test";

test.describe("Admin dashboard", () => {
  test("loads dashboard page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("ShipLens");
    await expect(page.locator("h2")).toContainText("Dashboard");
  });
});
