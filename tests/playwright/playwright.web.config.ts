import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.PW_WEB_BASE_URL ?? "http://localhost:3000";
const apiBaseOrigin = process.env.PW_API_BASE_ORIGIN ?? "http://localhost:4000";
const corsOrigins =
  process.env.PW_WEB_API_CORS_ORIGINS ??
  "http://localhost:3000,http://127.0.0.1:3000";
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS !== "false";
const headless = process.env.PW_HEADLESS === "true";

export default defineConfig({
  testDir: "./web",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 20_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./reports/web" }]],
  use: {
    baseURL: webBaseUrl,
    headless,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: `CORS_ORIGINS="${corsOrigins}" STRICT_ORIGIN_CHECK=true pnpm --filter @illamhelp/api dev`,
      url: `${apiBaseOrigin}/api/v1/health`,
      timeout: 240_000,
      reuseExistingServer
    },
    {
      command: "pnpm --filter @illamhelp/web dev",
      url: webBaseUrl,
      timeout: 240_000,
      reuseExistingServer
    }
  ],
  projects: [
    {
      name: "web-chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
