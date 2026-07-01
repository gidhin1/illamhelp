import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { pickBaseUrl, pickServerTarget } from "./server-targets";

const initialRepoRoot = existsSync(resolve(process.cwd(), "web", "package.json"))
  ? process.cwd()
  : resolve(process.cwd(), "..", "..");
loadEnvConfig(resolve(initialRepoRoot, "web"));

const apiTarget = pickServerTarget(process.env.PW_API_BASE_ORIGIN, "http://localhost:4000", "http://localhost:4010");
const webTarget = pickBaseUrl(
  process.env.PW_WEB_BASE_URL,
  "http://localhost:3000",
  apiTarget.reuseExistingServer ? "http://localhost:3000" : "http://localhost:3100"
);
const adminTarget = pickBaseUrl(
  process.env.PW_ADMIN_BASE_URL,
  "http://localhost:3003",
  apiTarget.reuseExistingServer ? "http://localhost:3003" : "http://localhost:3103"
);
const webBaseUrl = webTarget.baseUrl;
const adminBaseUrl = adminTarget.baseUrl;
const apiBaseOrigin = apiTarget.baseUrl;
const apiBaseUrl = process.env.PW_API_BASE_URL ?? `${apiBaseOrigin.replace(/\/$/, "")}/api/v1`;
const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "G-PLAYWRIGHT";
const e2eAnalyticsConsent = process.env.PW_E2E_ANALYTICS_CONSENT ?? "";
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
const browserChannel = process.env.PW_BROWSER_CHANNEL;
const video = process.env.PW_VIDEO === "off" ? "off" as const : "retain-on-failure" as const;

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
    video
  },
  webServer: [
    {
      command: `PORT="${apiPort}" NODE_ENV=test AUTH_RATE_LIMIT_MAX="${playwrightAuthRateLimitMax}" CORS_ORIGINS="${corsOrigins}" STRICT_ORIGIN_CHECK=true mvn -f api-java/pom.xml spring-boot:run`,
      url: apiTarget.healthUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || apiTarget.reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${apiBaseUrl}" NEXT_PUBLIC_GA4_MEASUREMENT_ID="${ga4MeasurementId}" NEXT_PUBLIC_E2E_ANALYTICS_CONSENT="${e2eAnalyticsConsent}" bash ./scripts/start-web-playwright.sh`,
      url: webBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || webTarget.reuseExistingServer
    },
    {
      command: `NEXT_PUBLIC_API_BASE_URL="${apiBaseUrl}" PW_ADMIN_BASE_URL="${adminBaseUrl}" bash ./scripts/start-admin-playwright.sh`,
      url: adminBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer: reuseExistingServer || adminTarget.reuseExistingServer
    }
  ],
  projects: [
    {
      name: "web-chromium",
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
