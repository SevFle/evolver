import { test, expect } from "@playwright/test";

test.describe("Endpoints", () => {
  test("shows endpoints page", async ({ page }) => {
    await page.goto("/endpoints");
    await expect(page.locator("h1")).toHaveText("Endpoints");
  });
});
