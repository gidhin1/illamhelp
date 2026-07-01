import { expect, test } from "@playwright/test";

const APP_ANALYTICS_EVENTS = [
  "landing_viewed",
  "page_viewed",
  "signup_started",
  "signup_completed",
  "login_completed",
  "legal_consent_updated",
  "profile_updated",
  "profile_media_uploaded",
  "job_created",
  "job_media_uploaded",
  "job_applied",
  "connection_requested",
  "connection_accepted",
  "consent_requested",
  "consent_granted",
  "consent_revoked",
  "verification_started",
  "verification_submitted",
  "help_topic_viewed",
  "faq_viewed",
  "legal_document_viewed"
];

async function installAnalyticsCapture(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript((eventNames) => {
    const existing = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    const captured: Record<string, unknown>[] = [];
    const capture = (entry: unknown): void => {
      if (
        entry &&
        typeof entry === "object" &&
        "event" in entry &&
        eventNames.includes(String((entry as { event?: unknown }).event))
      ) {
        captured.push(entry as Record<string, unknown>);
      }
    };
    existing.forEach(capture);
    const dataLayer = existing as unknown[] & { push: (...items: unknown[]) => number };
    const originalPush = dataLayer.push.bind(dataLayer);
    dataLayer.push = (...items: unknown[]): number => {
      items.forEach(capture);
      return originalPush(...items);
    };
    window.dataLayer = dataLayer as typeof window.dataLayer;
    (window as typeof window & { __illamhelpAnalyticsEvents?: Record<string, unknown>[] })
      .__illamhelpAnalyticsEvents = captured;
  }, APP_ANALYTICS_EVENTS);
}

async function appAnalyticsEvents(page: import("@playwright/test").Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => {
    return (window as typeof window & { __illamhelpAnalyticsEvents?: Record<string, unknown>[] })
      .__illamhelpAnalyticsEvents ?? [];
  });
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
  await expect.poll(() => urls.join("\n")).toContain(`en=${eventName}`);
}

test("rejecting analytics consent keeps customer events out of dataLayer", async ({ page }) => {
  await installAnalyticsCapture(page);
  await page.goto("/?utm_source=qa&utm_medium=e2e&utm_campaign=analytics_reject");
  const banner = page.getByLabel("Analytics privacy choice");
  if (await banner.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Reject" }).click();
  } else {
    await page.evaluate(() => {
      window.localStorage.setItem(
        "illamhelp.analyticsConsent.v1",
        JSON.stringify({ analytics: "denied", ads: "denied", updatedAt: new Date().toISOString() })
      );
    });
  }

  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();

  await expect.poll(() => appAnalyticsEvents(page)).toEqual([]);
});

test("accepting analytics consent enables page and content-view events with UTM context", async ({ page }) => {
  await installAnalyticsCapture(page);
  const ga4CollectUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      /https:\/\/(?:www\.|region1\.)?google-analytics\.com\/g\/collect/.test(url) ||
      /https:\/\/analytics\.google\.com\/g\/collect/.test(url)
    ) {
      ga4CollectUrls.push(url);
    }
  });
  const collectedEvents: Record<string, unknown>[] = [];
  const collectEvents = async (): Promise<void> => {
    collectedEvents.push(...await appAnalyticsEvents(page));
  };

  await page.goto("/?utm_source=qa&utm_medium=e2e&utm_campaign=analytics_accept");
  const banner = page.getByLabel("Analytics privacy choice");
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect(banner).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("illamhelp.analyticsConsent.v1"))).toContain(
    "\"analytics\":\"granted\""
  );
  await collectEvents();
  await waitForGa4Event(ga4CollectUrls, "legal_consent_updated");

  await page.getByRole("link", { name: "FAQ" }).click();
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  await expect.poll(async () => {
    await collectEvents();
    return collectedEvents.map((entry) => entry.event);
  }).toContain("faq_viewed");
  await waitForGa4Event(ga4CollectUrls, "faq_viewed");

  await expect.poll(async () => {
    return collectedEvents.map((entry) => entry.event);
  }).toEqual(expect.arrayContaining([
    "page_viewed",
    "faq_viewed"
  ]));

  expect(collectedEvents).toContainEqual(expect.objectContaining({
    event: "faq_viewed",
    surface: "web",
    utm_source: "qa",
    utm_medium: "e2e",
    utm_campaign: "analytics_accept"
  }));
  await expect.poll(() => ga4EventNamesFromRequestUrls(ga4CollectUrls)).toEqual(expect.arrayContaining([
    "legal_consent_updated",
    "page_viewed",
    "faq_viewed"
  ]));
  expect(JSON.stringify(collectedEvents)).not.toMatch(/email|phone|address|documentMediaIds|mediaUrl|downloadUrl/i);
});
