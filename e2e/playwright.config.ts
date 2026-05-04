import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api",
      testMatch: /health\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.API_BASE_URL ?? "http://localhost:3001",
      },
    },
    {
      name: "tracker",
      testMatch: /tracker\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.TRACKER_BASE_URL ?? "http://localhost:3000",
      },
    },
    {
      name: "admin",
      testMatch: /admin-shipments\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_BASE_URL ?? "http://localhost:3002",
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace=@shiplens/api",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: true,
      timeout: 30000,
      cwd: "../",
    },
    {
      command: "npm run dev --workspace=@shiplens/tracker",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 60000,
      cwd: "../",
    },
    {
      command: "npm run dev --workspace=@shiplens/admin",
      url: "http://localhost:3002",
      reuseExistingServer: true,
      timeout: 60000,
      cwd: "../",
    },
  ],
});
