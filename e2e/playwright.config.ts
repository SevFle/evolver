import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.API_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev --workspace=@shiplens/api",
    url: "http://localhost:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
