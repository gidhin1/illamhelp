import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsEventPayload } from "@illamhelp/shared-types";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  applyAnalyticsConsent,
  captureUtmFromLocation,
  identifyAnalyticsUser,
  readAnalyticsConsent,
  setAnalyticsConsent,
  trackEvent,
  trackPageView
} from "./analytics";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

function installWindow(url = "http://localhost:3000/"): {
  dataLayer: Record<string, unknown>[];
  gtag: ReturnType<typeof vi.fn>;
  storage: MemoryStorage;
} {
  const dataLayer: Record<string, unknown>[] = [];
  const gtag = vi.fn();
  const storage = new MemoryStorage();
  vi.stubGlobal("window", {
    location: new URL(url),
    localStorage: storage,
    dataLayer,
    gtag
  });
  return { dataLayer, gtag, storage };
}

const eventFixtures: AnalyticsEventPayload[] = [
  { event: "landing_viewed", params: { surface: "web", route: "/" } },
  { event: "page_viewed", params: { surface: "web", route: "/jobs" } },
  { event: "signup_started", params: { surface: "web", source: "register_page" } },
  { event: "signup_completed", params: { surface: "web", method: "password", user_type: "both" } },
  { event: "login_completed", params: { surface: "web", method: "password" } },
  {
    event: "legal_consent_updated",
    params: { surface: "web", analytics_consent: "granted", ad_consent: "denied" }
  },
  { event: "profile_updated", params: { surface: "web", fields_changed_count: 2 } },
  {
    event: "profile_media_uploaded",
    params: { surface: "web", media_kind: "image", media_count: 1 }
  },
  { event: "job_created", params: { surface: "web", category: "plumber", visibility: "public" } },
  {
    event: "job_media_uploaded",
    params: { surface: "web", media_kind: "video", media_count: 1 }
  },
  { event: "job_applied", params: { surface: "web", category: "cleaning" } },
  { event: "connection_requested", params: { surface: "web", source: "search" } },
  { event: "connection_accepted", params: { surface: "web" } },
  { event: "consent_requested", params: { surface: "web", field_count: 2 } },
  { event: "consent_granted", params: { surface: "web", field_count: 1 } },
  { event: "consent_revoked", params: { surface: "web" } },
  { event: "verification_started", params: { surface: "web", document_type: "government_id" } },
  {
    event: "verification_submitted",
    params: { surface: "web", document_type: "government_id", document_count: 2 }
  },
  {
    event: "provider_verified",
    params: { surface: "server", verification_request_id: "verification-request" }
  },
  { event: "help_topic_viewed", params: { surface: "web", topic_name: "profile_media" } },
  { event: "faq_viewed", params: { surface: "web", question: "How do media rules work?" } },
  {
    event: "legal_document_viewed",
    params: { surface: "web", document_type: "privacy_policy", version: "2026-06-14" }
  }
];

describe("web analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps analytics denied by default and does not push events", () => {
    const { dataLayer, gtag } = installWindow();
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");

    trackPageView("/");

    expect(dataLayer).toEqual([]);
    expect(gtag).not.toHaveBeenCalledWith("event", expect.any(String), expect.anything());
  });

  it("can default analytics consent to granted for explicit E2E analytics runs", () => {
    const { dataLayer } = installWindow();
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
    vi.stubEnv("NEXT_PUBLIC_E2E_ANALYTICS_CONSENT", "granted");

    trackPageView("/");

    expect(dataLayer).toContainEqual(expect.objectContaining({ event: "landing_viewed" }));
  });

  it("replays stored granted consent to GA4 before tracking page events", () => {
    const { dataLayer, gtag, storage } = installWindow();
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
    storage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: "granted", ads: "denied", updatedAt: "2026-07-01T00:00:00.000Z" })
    );

    applyAnalyticsConsent(readAnalyticsConsent());
    trackPageView("/");

    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied"
    });
    expect(dataLayer).toContainEqual(expect.objectContaining({ event: "landing_viewed" }));
  });

  it("updates consent and emits every taxonomy event to dataLayer and direct GA4", () => {
    const { dataLayer, gtag, storage } = installWindow(
      "http://localhost:3000/?utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_term=helper&utm_content=hero"
    );
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
    captureUtmFromLocation();
    setAnalyticsConsent({ analytics: "granted", ads: "denied" });
    identifyAnalyticsUser("analytics-user");

    for (const fixture of eventFixtures) {
      trackEvent(fixture.event, fixture.params);
    }

    const emittedEvents = dataLayer.map((entry) => entry.event);
    expect(emittedEvents).toEqual(expect.arrayContaining(eventFixtures.map((fixture) => fixture.event)));
    expect(dataLayer).toContainEqual(expect.objectContaining({
      event: "signup_completed",
      analytics_user_id: "analytics-user",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "launch"
    }));
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied"
    });
    expect(gtag).toHaveBeenCalledWith("set", { user_id: "analytics-user" });
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "provider_verified",
      expect.objectContaining({ verification_request_id: "verification-request" })
    );
    expect(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toContain("\"analytics\":\"granted\"");
    expect(JSON.stringify(dataLayer)).not.toMatch(/email|phone|address|documentMediaIds|mediaUrl|downloadUrl/i);
  });

  it("still sends directly to GA4 when a GTM container is configured but a measurement ID is present", () => {
    const { dataLayer, gtag } = installWindow();
    vi.stubEnv("NEXT_PUBLIC_GTM_ID", "GTM-TEST");
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
    setAnalyticsConsent({ analytics: "granted", ads: "denied" });

    trackEvent("job_created", { surface: "web", category: "plumber", visibility: "public" });

    expect(dataLayer).toContainEqual(expect.objectContaining({ event: "job_created" }));
    expect(gtag).toHaveBeenCalledWith("event", "job_created", expect.objectContaining({ send_to: "G-TEST" }));
  });
});
