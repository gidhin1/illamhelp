import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { pickBaseUrl, pickServerTarget } from "./server-targets";

const adminApiTarget = pickServerTarget(
  process.env.PW_ADMIN_API_BASE_ORIGIN,
  "http://localhost:4000",
  "http://localhost:4011"
);
const adminTarget = pickBaseUrl(
  process.env.PW_ADMIN_BASE_URL,
  "http://localhost:3003",
  adminApiTarget.reuseExistingServer ? "http://localhost:3003" : "http://localhost:3103"
);
const webTarget = pickBaseUrl(
  process.env.PW_WEB_BASE_URL,
  "http://localhost:3000",
  adminApiTarget.reuseExistingServer ? "http://localhost:3000" : "http://localhost:3100"
);
const adminBaseUrl = adminTarget.baseUrl;
const webBaseUrl = webTarget.baseUrl;
const adminApiBaseOrigin = adminApiTarget.baseUrl;
const adminApiBaseUrl = process.env.PW_ADMIN_API_BASE_URL ?? `${adminApiBaseOrigin.replace(/\/$/, "")}/api/v1`;
const adminApiPort = new URL(adminApiBaseOrigin).port || "4011";
const adminAuthRateLimitMax = process.env.PW_AUTH_RATE_LIMIT_MAX ?? "2000";
const defaultAdminApiCorsOrigins = [
  adminBaseUrl,
  adminBaseUrl.replace("localhost", "127.0.0.1"),
  webBaseUrl,
  webBaseUrl.replace("localhost", "127.0.0.1")
].join(",");
const adminCorsOrigins = process.env.PW_ADMIN_API_CORS_ORIGINS ?? defaultAdminApiCorsOrigins;
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS
  ? process.env.PW_REUSE_EXISTING_SERVERS === "true"
  : !process.env.CI;
const headless = process.env.PW_HEADLESS === "true";
const browserChannel = process.env.PW_BROWSER_CHANNEL;
const video = process.env.PW_VIDEO === "off" ? "off" as const : "retain-on-failure" as const;

process.env.PW_ADMIN_BASE_URL = adminBaseUrl;
process.env.PW_WEB_BASE_URL = webBaseUrl;
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
  timeout: 10_000,
  expect: {
    timeout: 10_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./reports/admin" }]],
  use: {
    baseURL: adminBaseUrl,
    headless,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video
  },
  webServer: [
    {
      command: `PORT="${adminApiPort}" NODE_ENV=test AUTH_RATE_LIMIT_MAX="${adminAuthRateLimitMax}" CORS_ORIGINS="${adminCorsOrigins}" STRICT_ORIGIN_CHECK=true mvn -f api-java/pom.xml spring-boot:run`,
      url: adminApiTarget.healthUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || adminApiTarget.reuseExistingServer
    },
    {
      command: `PW_WEB_BASE_URL="${webBaseUrl}" NEXT_PUBLIC_API_BASE_URL="${adminApiBaseUrl}" bash ./scripts/start-web-playwright.sh`,
      url: webBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || webTarget.reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${adminApiBaseUrl}" bash ./scripts/start-admin-playwright.sh`,
      url: adminBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || adminTarget.reuseExistingServer
    }
  ],
  projects: [
    {
      name: "admin-chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        deviceScaleFactor: undefined,
        viewport: null,
        launchOptions: {
          args: ["--start-maximized"]
        }
      }
    }
  ]
});
