import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsEventPayload } from "@illamhelp/shared-types";

const mobileFixtures: AnalyticsEventPayload[] = [
  { event: "landing_viewed", params: { surface: "mobile", route: "home" } },
  { event: "page_viewed", params: { surface: "mobile", route: "jobs-discover" } },
  { event: "signup_started", params: { surface: "mobile", source: "register_form" } },
  { event: "signup_completed", params: { surface: "mobile", method: "password", user_type: "both" } },
  { event: "login_completed", params: { surface: "mobile", method: "password" } },
  {
    event: "legal_consent_updated",
    params: { surface: "mobile", analytics_consent: "granted", ad_consent: "denied" }
  },
  { event: "profile_updated", params: { surface: "mobile", fields_changed_count: 2 } },
  {
    event: "profile_media_uploaded",
    params: { surface: "mobile", media_kind: "mixed", media_count: 3 }
  },
  { event: "job_created", params: { surface: "mobile", category: "plumber", visibility: "connections_only" } },
  {
    event: "job_media_uploaded",
    params: { surface: "mobile", media_kind: "video", media_count: 1 }
  },
  { event: "job_applied", params: { surface: "mobile", category: "cleaning" } },
  { event: "connection_requested", params: { surface: "mobile", source: "profile" } },
  { event: "connection_accepted", params: { surface: "mobile" } },
  { event: "consent_requested", params: { surface: "mobile", field_count: 2 } },
  { event: "consent_granted", params: { surface: "mobile", field_count: 1 } },
  { event: "consent_revoked", params: { surface: "mobile" } },
  { event: "verification_started", params: { surface: "mobile", document_type: "government_id" } },
  {
    event: "verification_submitted",
    params: { surface: "mobile", document_type: "government_id", document_count: 2 }
  },
  { event: "help_topic_viewed", params: { surface: "mobile", topic_name: "help_center" } },
  { event: "faq_viewed", params: { surface: "mobile", question: "How do I upload media?" } },
  {
    event: "legal_document_viewed",
    params: { surface: "mobile", document_type: "terms", version: "2026-06-14" }
  }
];

async function loadAnalytics(): Promise<typeof import("./analytics")> {
  vi.resetModules();
  return import("./analytics");
}

describe("mobile analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("no-ops until analytics consent is granted", async () => {
    const logEvent = vi.fn();
    vi.stubGlobal("illamhelpNativeAnalytics", { logEvent });
    const analytics = await loadAnalytics();

    analytics.trackEvent("page_viewed", { surface: "mobile", route: "home" });

    expect(logEvent).not.toHaveBeenCalled();
  });

  it("emits every mobile customer event through the native analytics bridge after consent", async () => {
    const bridge = {
      logEvent: vi.fn(),
      setConsent: vi.fn(),
      setUserId: vi.fn()
    };
    vi.stubGlobal("illamhelpNativeAnalytics", bridge);
    const analytics = await loadAnalytics();

    analytics.setAnalyticsConsent({ analytics: "granted", ads: "denied" });
    analytics.identifyAnalyticsUser("analytics-mobile-user");
    for (const fixture of mobileFixtures) {
      analytics.trackEvent(fixture.event, fixture.params);
    }

    expect(bridge.setConsent).toHaveBeenCalledWith({ analytics: true, ads: false });
    expect(bridge.setUserId).toHaveBeenCalledWith("analytics-mobile-user");
    expect(bridge.logEvent.mock.calls.map(([event]) => event)).toEqual(
      expect.arrayContaining(mobileFixtures.map((fixture) => fixture.event))
    );
    expect(bridge.logEvent).toHaveBeenCalledWith(
      "job_media_uploaded",
      expect.objectContaining({
        schema_version: "v1",
        analytics_user_id: "analytics-mobile-user",
        media_kind: "video"
      })
    );
    expect(JSON.stringify(bridge.logEvent.mock.calls)).not.toMatch(/email|phone|address|documentMediaIds|mediaUrl|downloadUrl/i);
  });
});
