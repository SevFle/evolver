import { test, expect } from "@playwright/test";

test.describe("Endpoints", () => {
  test("shows endpoints page with heading", async ({ page }) => {
    await page.goto("/endpoints");
    await expect(
      page.getByRole("heading", { name: "Endpoints" })
    ).toBeVisible();
  });

  test("shows subtitle description", async ({ page }) => {
    await page.goto("/endpoints");
    await expect(
      page.getByText("Manage your webhook destination endpoints")
    ).toBeVisible();
  });

  test("shows empty state when no endpoints exist", async ({ page }) => {
    await page.goto("/endpoints");
    await expect(
      page.getByText("No endpoints yet. Create your first endpoint to start sending webhooks.")
    ).toBeVisible();
  });

  test("shows Add endpoint button", async ({ page }) => {
    await page.goto("/endpoints");
    await expect(
      page.getByRole("button", { name: "Add endpoint" })
    ).toBeVisible();
  });

  test.describe("Dashboard layout", () => {
    test("shows sidebar with HookRelay branding", async ({ page }) => {
      await page.goto("/endpoints");
      await expect(
        page.getByRole("link", { name: "HookRelay" }).first()
      ).toBeVisible();
    });

    test("shows all sidebar navigation items", async ({ page }) => {
      await page.goto("/endpoints");
      await expect(page.getByRole("link", { name: "Endpoints" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Events" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Deliveries" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    });

    test("navigates to Events page from sidebar", async ({ page }) => {
      await page.goto("/endpoints");
      await page.getByRole("link", { name: "Events" }).click();
      await expect(page).toHaveURL(/\/events/);
      await expect(
        page.getByRole("heading", { name: "Events" })
      ).toBeVisible();
    });

    test("navigates to Deliveries page from sidebar", async ({ page }) => {
      await page.goto("/endpoints");
      await page.getByRole("link", { name: "Deliveries" }).click();
      await expect(page).toHaveURL(/\/deliveries/);
      await expect(
        page.getByRole("heading", { name: "Deliveries" })
      ).toBeVisible();
    });

    test("navigates to Analytics page from sidebar", async ({ page }) => {
      await page.goto("/endpoints");
      await page.getByRole("link", { name: "Analytics" }).click();
      await expect(page).toHaveURL(/\/analytics/);
      await expect(
        page.getByRole("heading", { name: "Analytics" })
      ).toBeVisible();
    });

    test("navigates to Settings page from sidebar", async ({ page }) => {
      await page.goto("/endpoints");
      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings/);
      await expect(
        page.getByRole("heading", { name: "Settings" })
      ).toBeVisible();
    });

    test("navigates back to landing via HookRelay logo", async ({ page }) => {
      await page.goto("/endpoints");
      await page.getByRole("link", { name: "HookRelay" }).first().click();
      await expect(page).toHaveURL(/\//);
    });
  });

  test.describe("Endpoint management UI", () => {
    test("empty state is inside a bordered container", async ({ page }) => {
      await page.goto("/endpoints");
      const borderContainer = page.locator(".rounded-lg.border");
      await expect(borderContainer).toBeVisible();
      await expect(
        borderContainer.getByText("No endpoints yet")
      ).toBeVisible();
    });

    test("heading and button are in a flex row", async ({ page }) => {
      await page.goto("/endpoints");
      const flexContainer = page.locator(".flex.items-center.justify-between");
      await expect(flexContainer).toBeVisible();
      await expect(
        flexContainer.getByRole("heading", { name: "Endpoints" })
      ).toBeVisible();
      await expect(
        flexContainer.getByRole("button", { name: "Add endpoint" })
      ).toBeVisible();
    });
  });

  test.describe("Navigation from other dashboard pages", () => {
    test("can reach endpoints from deliveries page", async ({ page }) => {
      await page.goto("/deliveries");
      await page.getByRole("link", { name: "Endpoints" }).click();
      await expect(page).toHaveURL(/\/endpoints/);
      await expect(
        page.getByRole("heading", { name: "Endpoints" })
      ).toBeVisible();
    });

    test("can reach endpoints from events page", async ({ page }) => {
      await page.goto("/events");
      await page.getByRole("link", { name: "Endpoints" }).click();
      await expect(page).toHaveURL(/\/endpoints/);
      await expect(
        page.getByRole("heading", { name: "Endpoints" })
      ).toBeVisible();
    });

    test("can reach endpoints from settings page", async ({ page }) => {
      await page.goto("/settings");
      await page.getByRole("link", { name: "Endpoints" }).click();
      await expect(page).toHaveURL(/\/endpoints/);
    });
  });
});
