import { test, expect } from "@playwright/test";

const DEMO_TRACKING_ID = "SL-E2E-DEMO";

test.describe("Public Tracking Page", () => {
  test.describe("Happy path — valid tracking ID", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/track/${DEMO_TRACKING_ID}`);
    });

    test("renders branded header with tenant name", async ({ page }) => {
      const brandName = page.locator(".tracking-brand-name");
      await expect(brandName).toHaveText("Acme Logistics");

      const header = page.locator(".tracking-header");
      await expect(header).toBeVisible();
    });

    test("applies tenant primary color to branding elements", async ({ page }) => {
      const brandName = page.locator(".tracking-brand-name");
      const color = await brandName.evaluate(
        (el) => getComputedStyle(el).color,
      );
      expect(color).toBeTruthy();
    });

    test("renders tenant tagline", async ({ page }) => {
      const tagline = page.locator(".tracking-tagline");
      await expect(tagline).toHaveText("Your cargo, our commitment");
    });

    test("renders footer with powered-by text", async ({ page }) => {
      const powered = page.locator(".tracking-footer-powered");
      await expect(powered).toContainText("Powered by");
      await expect(powered).toContainText("ShipLens");
    });

    test("renders custom footer text", async ({ page }) => {
      const custom = page.locator(".tracking-footer-custom");
      await expect(custom).toContainText("Acme Logistics — Global Freight Solutions Since 2010");
    });

    test("renders footer contact links", async ({ page }) => {
      const emailLink = page.locator(".tracking-footer-link[href^='mailto:']");
      await expect(emailLink).toHaveAttribute("href", "mailto:support@acmelogistics.com");
      await expect(emailLink).toContainText("support@acmelogistics.com");

      const phoneLink = page.locator(".tracking-footer-link[href^='tel:']");
      await expect(phoneLink).toHaveAttribute("href", "tel:+1 (555) 123-4567");

      const supportLink = page.locator(".tracking-footer-link[href='https://support.acmelogistics.com']");
      await expect(supportLink).toContainText("Support");
    });

    test("renders shipment origin and destination", async ({ page }) => {
      const routeValues = page.locator(".shipment-route-value");
      await expect(routeValues.nth(0)).toHaveText("Shanghai, CN");
      await expect(routeValues.nth(1)).toHaveText("Los Angeles, US");
    });

    test("renders shipment status badge", async ({ page }) => {
      const badge = page.locator(".shipment-status-badge");
      await expect(badge).toHaveText("IN TRANSIT");
      await expect(badge).toHaveClass(/status-active/);
    });

    test("renders metadata grid with tracking ID and carrier", async ({ page }) => {
      const labels = page.locator(".shipment-meta-label");
      const values = page.locator(".shipment-meta-value");

      await expect(labels.nth(0)).toHaveText("Tracking ID");
      await expect(values.nth(0)).toHaveText(DEMO_TRACKING_ID);

      await expect(labels.nth(1)).toHaveText("Carrier");
      await expect(values.nth(1)).toHaveText("Maersk");
    });

    test("renders milestone timeline with heading", async ({ page }) => {
      const heading = page.locator(".milestone-section-title");
      await expect(heading).toHaveText("Shipment Timeline");

      const milestones = page.locator(".milestone-item");
      await expect(milestones).toHaveCount(5);
    });

    test("renders Latest badge on first milestone only", async ({ page }) => {
      const latestBadges = page.locator(".milestone-latest-badge");
      await expect(latestBadges).toHaveCount(1);
      await expect(latestBadges.first()).toHaveText("Latest");
    });

    test("renders milestone types in order", async ({ page }) => {
      const types = page.locator(".milestone-type");
      await expect(types.nth(0)).toHaveText("In transit");
      await expect(types.nth(1)).toHaveText("Departed origin");
      await expect(types.nth(2)).toHaveText("Customs cleared");
      await expect(types.nth(3)).toHaveText("Picked up");
      await expect(types.nth(4)).toHaveText("Booked");
    });

    test("renders milestone descriptions", async ({ page }) => {
      const descriptions = page.locator(".milestone-description");
      await expect(descriptions).toHaveCount(5);
      await expect(descriptions.first()).toHaveText(
        "Container loaded on vessel MAERSK SEALAND",
      );
    });

    test("renders milestone locations", async ({ page }) => {
      const locations = page.locator(".milestone-location");
      await expect(locations.first()).toContainText("Pacific Ocean");
    });

    test("renders milestone dates", async ({ page }) => {
      const times = page.locator(".milestone-time");
      await expect(times.first()).toContainText("May");
      await expect(times.first()).toContainText("2026");
    });

    test("has correct page title", async ({ page }) => {
      await expect(page).toHaveTitle(new RegExp(DEMO_TRACKING_ID));
    });

    test("renders connecting lines between milestones", async ({ page }) => {
      const lines = page.locator(".milestone-line");
      await expect(lines).toHaveCount(4);
    });
  });

  test.describe("Not-found — unknown tracking ID", () => {
    test("shows not-found message for non-existent tracking ID", async ({ page }) => {
      await page.goto("/track/SL-NONEXISTENT-999");

      const notFoundTitle = page.locator(".tracking-not-found-title");
      await expect(notFoundTitle).toHaveText("Shipment Not Found");

      const notFoundText = page.locator(".tracking-not-found-text");
      await expect(notFoundText).toContainText("SL-NONEXISTENT-999");
    });

    test("still renders branded shell for not-found page", async ({ page }) => {
      await page.goto("/track/SL-NONEXISTENT-999");

      const footer = page.locator(".tracking-footer-powered");
      await expect(footer).toContainText("Powered by");

      const brandName = page.locator(".tracking-brand-name");
      await expect(brandName).toHaveText("ShipLens");
    });
  });

  test.describe("Legacy redirect", () => {
    test("redirects /:trackingId to /track/:trackingId", async ({ page }) => {
      await page.goto(`/${DEMO_TRACKING_ID}`);
      await expect(page).toHaveURL(new RegExp(`/track/${DEMO_TRACKING_ID}`));
      const brandName = page.locator(".tracking-brand-name");
      await expect(brandName).toHaveText("Acme Logistics");
    });
  });
});
