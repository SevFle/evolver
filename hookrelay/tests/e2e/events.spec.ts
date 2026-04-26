import { test, expect } from "@playwright/test";

test.describe("Events", () => {
  test("shows events page", async ({ page }) => {
    await page.goto("/events");
    await expect(page.locator("h1")).toHaveText("Events");
  });
});
