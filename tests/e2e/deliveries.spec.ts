import { test, expect } from "@playwright/test";

test.describe("Deliveries", () => {
  test("shows deliveries page", async ({ page }) => {
    await page.goto("/deliveries");
    await expect(page.locator("h1")).toHaveText("Deliveries");
  });
});
