import { test, expect } from "@playwright/test";

const MOCK_SHIPMENTS = [
  {
    id: "a1b2c3d4",
    trackingId: "SL-ALPHA-001",
    customerName: "Beta Corp",
    origin: "Shanghai, CN",
    destination: "Los Angeles, US",
    carrier: "Maersk",
    status: "in_transit",
    estimatedDelivery: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "e5f6g7h8",
    trackingId: "SL-BRAVO-002",
    customerName: "Gamma Inc",
    origin: "Hamburg, DE",
    destination: "New York, US",
    carrier: "CMA CGM",
    status: "delivered",
    estimatedDelivery: "2026-04-10T00:00:00.000Z",
  },
  {
    id: "i9j0k1l2",
    trackingId: "SL-CHARLIE-003",
    customerName: "Delta Ltd",
    origin: "Busan, KR",
    destination: "Long Beach, US",
    carrier: "COSCO",
    status: "exception",
    estimatedDelivery: "2026-05-20T00:00:00.000Z",
  },
  {
    id: "m3n4o5p6",
    trackingId: "SL-DELTA-004",
    customerName: "Epsilon Co",
    origin: "Ningbo, CN",
    destination: "Seattle, US",
    carrier: "Evergreen",
    status: "customs_clearance",
    estimatedDelivery: "2026-05-28T00:00:00.000Z",
  },
  {
    id: "q7r8s9t0",
    trackingId: "SL-ECHO-005",
    customerName: "Zeta LLC",
    origin: "Shenzhen, CN",
    destination: "Chicago, US",
    carrier: "ONE",
    status: "in_transit",
    estimatedDelivery: "2026-07-01T00:00:00.000Z",
  },
];

function makeMockResponse(
  shipments = MOCK_SHIPMENTS,
  total = shipments.length,
) {
  return {
    success: true,
    data: shipments,
    total,
    page: 1,
    pageSize: 25,
  };
}

async function mockShipmentsApi(page: import("@playwright/test").Page, response = makeMockResponse()) {
  await page.route("**/api/shipments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

test.describe("Admin Shipments List", () => {
  test.describe("Table data rendering", () => {
    test("renders page title and search input", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");

      await expect(page.locator("h1")).toHaveText("Shipments");

      const searchInput = page.locator('input[type="text"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute(
        "placeholder",
        /Search by tracking ID, customer/i,
      );
    });

    test("renders status filter tabs", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const buttons = page.locator("button");
      await expect(buttons).toHaveText(["All", "In Transit", "Delivered", "Delayed", "Customs"]);
    });

    test("renders shipment table with all column headers", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const headers = page.locator("thead th");
      await expect(headers).toHaveText([
        "Tracking ID",
        "Customer",
        "Origin",
        "Destination",
        "Carrier",
        "Status",
        "ETA",
      ]);
    });

    test("renders all shipment rows with correct data", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(5);

      const firstRowCells = rows.first().locator("td");
      await expect(firstRowCells.nth(0)).toContainText("SL-ALPHA-001");
      await expect(firstRowCells.nth(1)).toHaveText("Beta Corp");
      await expect(firstRowCells.nth(2)).toHaveText("Shanghai, CN");
      await expect(firstRowCells.nth(3)).toHaveText("Los Angeles, US");
      await expect(firstRowCells.nth(4)).toHaveText("Maersk");
      await expect(firstRowCells.nth(6)).toContainText("Jun");
    });

    test("renders tracking IDs as links", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const firstLink = page.locator("tbody tr:first-child a[href*='SL-ALPHA-001']");
      await expect(firstLink).toBeVisible();
      await expect(firstLink).toHaveAttribute("href", "/shipments/SL-ALPHA-001");
    });

    test("renders status badges with correct labels", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const rows = page.locator("tbody tr");
      const statusInFirstRow = rows.nth(0).locator("td").nth(5);
      await expect(statusInFirstRow).toContainText("In Transit");

      const statusInSecondRow = rows.nth(1).locator("td").nth(5);
      await expect(statusInSecondRow).toContainText("Delivered");

      const statusInThirdRow = rows.nth(2).locator("td").nth(5);
      await expect(statusInThirdRow).toContainText("Exception");
    });
  });

  test.describe("Search filtering", () => {
    test("filters shipments by tracking ID via search input", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("ALPHA");

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-ALPHA-001");
    });

    test("filters shipments by customer name via search input", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("Delta");

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("Delta Ltd");
    });

    test("filters shipments by origin via search input", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("Hamburg");

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-BRAVO-002");
    });

    test("shows empty state when search matches nothing", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("ZZZZ-NOTFOUND");

      await expect(page.locator("text=No shipments found.")).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(0);
    });

    test("restores all results when search is cleared", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("ALPHA");
      await expect(page.locator("tbody tr")).toHaveCount(1);

      await searchInput.fill("");
      await expect(page.locator("tbody tr")).toHaveCount(5);
    });
  });

  test.describe("Status filter tabs", () => {
    test("filters to in_transit shipments when In Transit tab clicked", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "In Transit" }).click();

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(2);
      for (const row of await rows.all()) {
        await expect(row.locator("td").nth(5)).toContainText("In Transit");
      }
    });

    test("filters to delivered shipments when Delivered tab clicked", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "Delivered" }).click();

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-BRAVO-002");
    });

    test("filters to exception shipments when Delayed tab clicked", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "Delayed" }).click();

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-CHARLIE-003");
    });

    test("filters to customs_clearance shipments when Customs tab clicked", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "Customs" }).click();

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-DELTA-004");
    });

    test("restores all shipments when All tab clicked", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "Delivered" }).click();
      await expect(page.locator("tbody tr")).toHaveCount(1);

      await page.locator("button", { hasText: "All" }).click();
      await expect(page.locator("tbody tr")).toHaveCount(5);
    });

    test("applies active styling to selected status tab", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      const allTab = page.locator("button", { hasText: "All" });
      const inTransitTab = page.locator("button", { hasText: "In Transit" });

      await expect(allTab).toHaveCSS("font-weight", "600");

      await inTransitTab.click();
      await expect(inTransitTab).toHaveCSS("font-weight", "600");
    });
  });

  test.describe("Combined search + status filter", () => {
    test("filters by both search term and status simultaneously", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "In Transit" }).click();
      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("ALPHA");

      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-ALPHA-001");

      await searchInput.fill("ECHO");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("SL-ECHO-005");
    });

    test("shows empty state when search + status combo matches nothing", async ({ page }) => {
      await mockShipmentsApi(page);
      await page.goto("/shipments");
      await page.locator("table").waitFor();

      await page.locator("button", { hasText: "Delivered" }).click();
      const searchInput = page.locator('input[type="text"]');
      await searchInput.fill("ALPHA");

      await expect(page.locator("text=No shipments found.")).toBeVisible();
    });
  });

  test.describe("Loading and error states", () => {
    test("shows loading state before data loads", async ({ page }) => {
      let resolveResponse: (value: unknown) => void;
      const responsePromise = new Promise((resolve) => {
        resolveResponse = resolve;
      });

      await page.route("**/api/shipments**", async (route) => {
        await responsePromise;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeMockResponse()),
        });
      });

      await page.goto("/shipments");
      await expect(page.locator("text=Loading shipments...")).toBeVisible();

      resolveResponse!(undefined);
      await page.locator("table").waitFor();
      await expect(page.locator("text=Loading shipments...")).not.toBeVisible();
    });

    test("shows error message when API returns error", async ({ page }) => {
      await page.route("**/api/shipments**", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ success: false, error: "Internal Server Error" }),
        });
      });

      await page.goto("/shipments");
      await expect(page.locator("text=API error: 500")).toBeVisible();
      await expect(page.locator("table")).toHaveCount(0);
    });

    test("shows error message when API is unreachable", async ({ page }) => {
      await page.route("**/api/shipments**", async (route) => {
        await route.abort("connectionfailed");
      });

      await page.goto("/shipments");
      await expect(page.locator("text=Failed to load shipments")).toBeVisible();
    });

    test("shows empty state when API returns empty data", async ({ page }) => {
      await mockShipmentsApi(page, makeMockResponse([]));
      await page.goto("/shipments");

      await expect(page.locator("text=No shipments found.")).toBeVisible();
      await expect(page.locator("table")).toHaveCount(0);
    });
  });
});
