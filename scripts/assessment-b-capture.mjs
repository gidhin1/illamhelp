import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../node_modules/.pnpm/playwright@1.60.0/node_modules/playwright");

const outDir = "/private/tmp/illamhelp-impeccable-assessment-b";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

async function inspect(base, name, routes, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const rows = [];

  for (const route of routes) {
    const url = `${base}${route}`;
    const safe = `${name}${route === "/" ? "-root" : route.replaceAll("/", "-")}`.replace(
      /[^a-zA-Z0-9-]/g,
      "-"
    );
    const screenshot = path.join(outDir, `${safe}-${viewport.width}x${viewport.height}.png`);
    let status = null;
    let title = "";
    let h1 = [];
    let h2 = [];
    let body = "";
    let error = null;

    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 25_000 });
      status = response?.status() ?? null;
      await page.screenshot({ path: screenshot, fullPage: true });
      title = await page.title();
      h1 = await page.locator("h1").allInnerTexts().catch(() => []);
      h2 = await page.locator("h2,h3").allInnerTexts().catch(() => []);
      body = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""))
        .slice(0, 900)
        .replace(/\s+/g, " ")
        .trim();
    } catch (captureError) {
      error = captureError instanceof Error ? captureError.message : String(captureError);
    }

    rows.push({
      name,
      route,
      url,
      status,
      title,
      h1,
      h2: h2.slice(0, 5),
      body,
      screenshot,
      error
    });
  }

  await context.close();
  return rows;
}

const results = [
  ...(await inspect(
    "http://127.0.0.1:3001",
    "web",
    ["/", "/jobs", "/profile", "/connections", "/people", "/privacy", "/consent", "/verification"],
    { width: 1440, height: 1000 }
  )),
  ...(await inspect(
    "http://127.0.0.1:3003",
    "admin",
    ["/", "/moderation", "/verifications", "/audit"],
    { width: 1440, height: 1000 }
  )),
  ...(await inspect("http://localhost:8081", "mobile-web", ["/"], { width: 390, height: 844 }))
];

await browser.close();
console.log(JSON.stringify(results, null, 2));
