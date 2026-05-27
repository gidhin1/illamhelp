import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const mobileBaseUrl = process.env.PW_MOBILE_BASE_URL ?? "http://localhost:3102";
const apiBaseOrigin = process.env.PW_MOBILE_API_BASE_ORIGIN ?? "http://localhost:4012";
const apiBaseUrl = process.env.PW_MOBILE_API_BASE_URL ?? `${apiBaseOrigin}/api/v1`;
const playwrightAuthRateLimitMax = process.env.PW_AUTH_RATE_LIMIT_MAX ?? "2000";
const apiPort = new URL(apiBaseOrigin).port || "4012";
const mobilePort = new URL(mobileBaseUrl).port || "3102";
const parsedMobileUrl = new URL(mobileBaseUrl);
const defaultCorsOrigins = [
  `${parsedMobileUrl.protocol}//localhost:${mobilePort}`,
  `${parsedMobileUrl.protocol}//127.0.0.1:${mobilePort}`
].join(",");
const corsOrigins = process.env.PW_MOBILE_API_CORS_ORIGINS ?? defaultCorsOrigins;
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS
  ? process.env.PW_REUSE_EXISTING_SERVERS === "true"
  : !process.env.CI;
const headless = process.env.PW_HEADLESS === "true";
const browserChannel = process.env.PW_BROWSER_CHANNEL;
const video = process.env.PW_VIDEO === "off" ? "off" as const : "retain-on-failure" as const;

process.env.PW_MOBILE_BASE_URL = mobileBaseUrl;
process.env.PW_MOBILE_API_BASE_ORIGIN = apiBaseOrigin;
process.env.PW_MOBILE_API_BASE_URL = apiBaseUrl;
process.env.PW_MOBILE_API_CORS_ORIGINS = corsOrigins;

function detectRepoRoot(): string {
  const current = process.cwd();
  if (existsSync(resolve(current, "mobile", "package.json"))) {
    return current;
  }

  const twoLevelsUp = resolve(current, "..", "..");
  if (existsSync(resolve(twoLevelsUp, "mobile", "package.json"))) {
    return twoLevelsUp;
  }

  return current;
}

const repoRoot = detectRepoRoot();

export default defineConfig({
  testDir: "./mobile",
  fullyParallel: false,
  workers: 1,
  timeout: 10_000,
  expect: {
    timeout: 10_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./reports/mobile" }]],
  use: {
    baseURL: mobileBaseUrl,
    headless,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video
  },
  webServer: [
    {
      command: `PORT="${apiPort}" NODE_ENV=test AUTH_RATE_LIMIT_MAX="${playwrightAuthRateLimitMax}" CORS_ORIGINS="${corsOrigins}" STRICT_ORIGIN_CHECK=true mvn -f api-java/pom.xml spring-boot:run`,
      url: `${apiBaseOrigin}/api/v1/health`,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    },
    {
      command: `CI=1 EXPO_PUBLIC_API_BASE_URL="${apiBaseUrl}" corepack pnpm --filter @illamhelp/mobile exec expo start --web --port "${mobilePort}"`,
      url: mobileBaseUrl,
      timeout: 240_000,
      cwd: repoRoot,
      reuseExistingServer
    }
  ],
  projects: [
    {
      name: "mobile-web-chromium",
      use: {
        ...devices["Pixel 7"],
        channel: browserChannel
      }
    }
  ]
});
