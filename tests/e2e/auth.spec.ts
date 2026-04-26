import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("shows login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Welcome back");
  });

  test("shows signup page", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("h1")).toHaveText("Create your account");
  });

  test("navigates from login to signup", async ({ page }) => {
    await page.goto("/login");
    await page.click('a[href="/signup"]');
    await expect(page.locator("h1")).toHaveText("Create your account");
  });
});
