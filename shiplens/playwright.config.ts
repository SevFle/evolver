import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      testDir: "./e2e/api",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tracker",
      testDir: "./e2e/tracker",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.TRACKER_BASE_URL ?? "http://localhost:3000",
      },
    },
    {
      name: "admin",
      testDir: "./e2e/admin",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.ADMIN_BASE_URL ?? "http://localhost:3002",
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace=@shiplens/api",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npm run dev --workspace=@shiplens/tracker",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npm run dev --workspace=@shiplens/admin",
      port: 3002,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
