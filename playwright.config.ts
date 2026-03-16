import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./packages/hydra-sdk/test/browser",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3999",
  },
  webServer: {
    command: "node packages/hydra-sdk/test/browser/server.mjs",
    port: 3999,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
