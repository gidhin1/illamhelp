import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3103";
const adminApiBaseOrigin = process.env.PW_ADMIN_API_BASE_ORIGIN ?? "http://localhost:4011";
const adminApiBaseUrl = process.env.PW_ADMIN_API_BASE_URL ?? `${adminApiBaseOrigin}/api/v1`;
const adminApiPort = new URL(adminApiBaseOrigin).port || "4011";
const adminAuthRateLimitMax = process.env.PW_AUTH_RATE_LIMIT_MAX ?? "2000";
const adminCorsOrigins =
  process.env.PW_ADMIN_API_CORS_ORIGINS ?? `${adminBaseUrl},${adminBaseUrl.replace("localhost", "127.0.0.1")}`;
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS === "true";
const headless = process.env.PW_HEADLESS === "true";

process.env.PW_ADMIN_BASE_URL = adminBaseUrl;
process.env.PW_ADMIN_API_BASE_ORIGIN = adminApiBaseOrigin;
process.env.PW_ADMIN_API_BASE_URL = adminApiBaseUrl;
process.env.PW_API_BASE_URL = process.env.PW_API_BASE_URL ?? adminApiBaseUrl;

function detectRepoRoot(): string {
  const current = process.cwd();
  const inCurrent = resolve(current, "scripts", "start-admin-playwright.sh");
  if (existsSync(inCurrent)) {
    return current;
  }

  const twoLevelsUp = resolve(current, "..", "..");
  const inTwoLevelsUp = resolve(twoLevelsUp, "scripts", "start-admin-playwright.sh");
  if (existsSync(inTwoLevelsUp)) {
    return twoLevelsUp;
  }

  return current;
}

const repoRoot = detectRepoRoot();

export default defineConfig({
  testDir: "./admin",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 20_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./reports/admin" }]],
  use: {
    baseURL: adminBaseUrl,
    headless,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: `PORT="${adminApiPort}" NODE_ENV=test AUTH_RATE_LIMIT_MAX="${adminAuthRateLimitMax}" CORS_ORIGINS="${adminCorsOrigins}" STRICT_ORIGIN_CHECK=true pnpm --filter @illamhelp/api dev`,
      url: `${adminApiBaseOrigin}/api/v1/health`,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${adminApiBaseUrl}" bash ./scripts/start-admin-playwright.sh`,
      url: adminBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    }
  ],
  projects: [
    {
      name: "admin-chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
