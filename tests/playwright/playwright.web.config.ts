import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const webBaseUrl = process.env.PW_WEB_BASE_URL ?? "http://localhost:3100";
const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3103";
const apiBaseOrigin = process.env.PW_API_BASE_ORIGIN ?? "http://localhost:4010";
const apiBaseUrl = process.env.PW_API_BASE_URL ?? `${apiBaseOrigin}/api/v1`;
const playwrightAuthRateLimitMax = process.env.PW_AUTH_RATE_LIMIT_MAX ?? "2000";
const apiPort = new URL(apiBaseOrigin).port || "4010";
function originsFor(baseUrl: string): string[] {
  const parsed = new URL(baseUrl);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return [
    `${parsed.protocol}//localhost:${port}`,
    `${parsed.protocol}//127.0.0.1:${port}`
  ];
}
const defaultCorsOrigins = Array.from(
  new Set([...originsFor(webBaseUrl), ...originsFor(adminBaseUrl)])
).join(",");
const corsOrigins = process.env.PW_WEB_API_CORS_ORIGINS ?? defaultCorsOrigins;
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS
  ? process.env.PW_REUSE_EXISTING_SERVERS === "true"
  : !process.env.CI;
const headless = process.env.PW_HEADLESS === "true";

process.env.PW_WEB_BASE_URL = webBaseUrl;
process.env.PW_ADMIN_BASE_URL = adminBaseUrl;
process.env.PW_API_BASE_ORIGIN = apiBaseOrigin;
process.env.PW_API_BASE_URL = apiBaseUrl;
process.env.PW_WEB_API_CORS_ORIGINS = corsOrigins;

function detectRepoRoot(): string {
  const current = process.cwd();
  const inCurrent = resolve(current, "scripts", "start-web-playwright.sh");
  if (existsSync(inCurrent)) {
    return current;
  }

  const twoLevelsUp = resolve(current, "..", "..");
  const inTwoLevelsUp = resolve(twoLevelsUp, "scripts", "start-web-playwright.sh");
  if (existsSync(inTwoLevelsUp)) {
    return twoLevelsUp;
  }

  return current;
}

const repoRoot = detectRepoRoot();

export default defineConfig({
  testDir: "./web",
  fullyParallel: false,
  workers: 1,
  timeout: 10_000,
  expect: {
    timeout: 10_000
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
      command: `PORT="${apiPort}" NODE_ENV=test AUTH_RATE_LIMIT_MAX="${playwrightAuthRateLimitMax}" CORS_ORIGINS="${corsOrigins}" STRICT_ORIGIN_CHECK=true pnpm --filter @illamhelp/api dev`,
      url: `${apiBaseOrigin}/api/v1/health`,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${apiBaseUrl}" bash ./scripts/start-web-playwright.sh`,
      url: webBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${apiBaseUrl}" PW_ADMIN_BASE_URL="${adminBaseUrl}" bash ./scripts/start-admin-playwright.sh`,
      url: adminBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
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
