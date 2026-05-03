import { test, expect } from "@playwright/test";

test.describe("Tracking page", () => {
  test("displays tracking ID on the page", async ({ page }) => {
    await page.goto("/TEST-SHIPMENT-001");
    await expect(page.locator("h1")).toContainText("Shipment Tracking");
    await expect(page.locator("text=TEST-SHIPMENT-001")).toBeVisible();
  });
});
