import { expect, test } from "@playwright/test";

function isGa4CollectUrl(url: string): boolean {
  return (
    /https:\/\/(?:www\.|region1\.)?google-analytics\.com\/g\/collect/.test(url) ||
    /https:\/\/analytics\.google\.com\/g\/collect/.test(url)
  );
}

function ga4EventNamesFromRequestUrls(urls: string[]): string[] {
  return urls.flatMap((url) => {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.getAll("en").filter(Boolean);
    } catch {
      return [];
    }
  });
}

async function waitForGa4Event(urls: string[], eventName: string): Promise<void> {
  await expect.poll(() => ga4EventNamesFromRequestUrls(urls)).toContain(eventName);
}

test("rejecting analytics consent keeps customer content-view events out of GA4", async ({ page }) => {
  const ga4CollectUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (isGa4CollectUrl(url)) {
      ga4CollectUrls.push(url);
    }
  });

  await page.goto("/?utm_source=qa&utm_medium=e2e&utm_campaign=analytics_reject");
  await expect(page.getByLabel("Analytics privacy choice")).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByLabel("Analytics privacy choice")).not.toBeVisible();

  await page.getByRole("link", { name: "FAQ" }).click();
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();

  await expect.poll(() => ga4EventNamesFromRequestUrls(ga4CollectUrls), { timeout: 2_000 }).not.toContain("faq_viewed");
});

test("accepting analytics consent sends page and content-view events to GA4 with UTM context", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID === "G-PLAYWRIGHT",
    "Set NEXT_PUBLIC_GA4_MEASUREMENT_ID or web/.env.local to verify real GA4 browser collection."
  );

  const ga4CollectUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (isGa4CollectUrl(url)) {
      ga4CollectUrls.push(url);
    }
  });

  await page.goto("/?utm_source=qa&utm_medium=e2e&utm_campaign=analytics_accept");
  await expect(page.getByLabel("Analytics privacy choice")).toBeVisible();
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect(page.getByLabel("Analytics privacy choice")).not.toBeVisible();
  await waitForGa4Event(ga4CollectUrls, "legal_consent_updated");

  await page.getByRole("link", { name: "FAQ" }).click();
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await waitForGa4Event(ga4CollectUrls, "page_viewed");
  await waitForGa4Event(ga4CollectUrls, "faq_viewed");

  const joinedUrls = ga4CollectUrls.join("\n");
  expect(joinedUrls).toContain("utm_source=qa");
  expect(joinedUrls).toContain("utm_medium=e2e");
  expect(joinedUrls).toContain("utm_campaign=analytics_accept");
  expect(joinedUrls).not.toMatch(/email|phone|address|documentMediaIds|mediaUrl|downloadUrl/i);
});
