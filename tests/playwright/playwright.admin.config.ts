import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const adminBaseUrl = process.env.PW_ADMIN_BASE_URL ?? "http://localhost:3003";
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVERS !== "false";
const headless = process.env.PW_HEADLESS === "true";

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
  webServer: {
    command: "bash ./scripts/start-admin-playwright.sh",
    url: adminBaseUrl,
    timeout: 240_000,
    cwd: repoRoot,
    reuseExistingServer
  },
  projects: [
    {
      name: "admin-chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
