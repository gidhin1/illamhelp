"use client";

import type {
  AnalyticsConsentChoice,
  AnalyticsEventName,
  AnalyticsParamsByEvent
} from "@illamhelp/shared-types";

export const ANALYTICS_CONSENT_STORAGE_KEY = "illamhelp.analyticsConsent.v1";
const UTM_STORAGE_KEY = "illamhelp.firstTouchUtm.v1";

type DataLayerEvent = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[];
    gtag?: (...args: unknown[]) => void;
    illamhelpAnalyticsUserId?: string;
    illamhelpGa4MeasurementId?: string;
  }
}

function analyticsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GTM_ID || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID);
}

export function e2eAnalyticsConsentGranted(): boolean {
  return process.env.NEXT_PUBLIC_E2E_ANALYTICS_CONSENT === "granted";
}

function directGa4Configured(): boolean {
  return Boolean(ga4MeasurementId());
}

function ga4MeasurementId(): string | undefined {
  if (typeof window !== "undefined" && window.illamhelpGa4MeasurementId) {
    return window.illamhelpGa4MeasurementId;
  }
  return process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
}

function ga4DebugMode(): boolean {
  return process.env.NEXT_PUBLIC_GA4_DEBUG_MODE === "true" || process.env.NODE_ENV !== "production";
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureGtag(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(args as unknown as DataLayerEvent);
  });
  return window.gtag;
}

function defaultConsent(): AnalyticsConsentChoice {
  const analytics = e2eAnalyticsConsentGranted() ? "granted" : "denied";
  return {
    analytics,
    ads: "denied",
    updatedAt: nowIso()
  };
}

export function readAnalyticsConsent(): AnalyticsConsentChoice {
  if (typeof window === "undefined") {
    return defaultConsent();
  }
  const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
  if (!stored) {
    return defaultConsent();
  }
  try {
    const parsed = JSON.parse(stored) as Partial<AnalyticsConsentChoice>;
    return {
      analytics: parsed.analytics === "granted" ? "granted" : "denied",
      ads: parsed.ads === "granted" ? "granted" : "denied",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso()
    };
  } catch {
    return defaultConsent();
  }
}

export function hasStoredAnalyticsConsent(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) !== null;
}

export function writeAnalyticsConsent(choice: Omit<AnalyticsConsentChoice, "updatedAt">): AnalyticsConsentChoice {
  const value = {
    ...choice,
    updatedAt: nowIso()
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(value));
  }
  return value;
}

export function setAnalyticsConsent(choice: Omit<AnalyticsConsentChoice, "updatedAt">): AnalyticsConsentChoice {
  const value = writeAnalyticsConsent(choice);
  applyAnalyticsConsent(value);
  if (value.analytics === "granted") {
    trackEvent("legal_consent_updated", {
      surface: "web",
      analytics_consent: value.analytics,
      ad_consent: value.ads
    });
  }
  return value;
}

export function applyAnalyticsConsent(choice: Pick<AnalyticsConsentChoice, "analytics" | "ads">): void {
  if (typeof window !== "undefined") {
    ensureGtag()("consent", "update", {
      analytics_storage: choice.analytics,
      ad_storage: choice.ads
    });
  }
}

export function identifyAnalyticsUser(analyticsUserId: string | null | undefined): void {
  if (!analyticsUserId || typeof window === "undefined") {
    return;
  }
  window.illamhelpAnalyticsUserId = analyticsUserId;
  if (!analyticsConfigured() || readAnalyticsConsent().analytics !== "granted") {
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "analytics_user_identified",
    analytics_user_id: analyticsUserId
  });
  if (directGa4Configured()) {
    window.gtag?.("set", { user_id: analyticsUserId });
  }
}

export function captureUtmFromLocation(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (window.localStorage.getItem(UTM_STORAGE_KEY)) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const values: Record<string, string> = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
    const value = params.get(key);
    if (value && value.length <= 120) {
      values[key] = value;
    }
  });
  if (Object.keys(values).length > 0) {
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(values));
  }
}

export function utmParams(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  const stored = window.localStorage.getItem(UTM_STORAGE_KEY);
  if (!stored) {
    return {};
  }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
        Object.entries(parsed)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, value as string])
    );
  } catch {
    return {};
  }
}

export function trackEvent<TName extends AnalyticsEventName>(
  event: TName,
  params: Omit<AnalyticsParamsByEvent[TName], "schema_version"> & { schema_version?: "v1" }
): void {
  if (typeof window === "undefined" || !analyticsConfigured()) {
    return;
  }
  if (readAnalyticsConsent().analytics !== "granted") {
    return;
  }
  const eventPayload = {
    event,
    schema_version: "v1",
    analytics_user_id: window.illamhelpAnalyticsUserId,
    ...utmParams(),
    ...params
  };
  if (directGa4Configured()) {
    const measurementId = ga4MeasurementId();
    const gtag = ensureGtag();
    const ga4Params = Object.fromEntries(
      Object.entries({
        ...eventPayload,
        send_to: measurementId,
        debug_mode: ga4DebugMode() ? true : undefined
      }).filter(([key, value]) => key !== "event" && value !== undefined)
    );
    gtag("config", measurementId, {
      send_page_view: false,
      debug_mode: ga4DebugMode()
    });
    gtag("event", event, ga4Params);
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(eventPayload);
}

export function trackPageView(route: string): void {
  if (route === "/") {
    trackEvent("landing_viewed", { surface: "web", route });
    return;
  }
  trackEvent("page_viewed", { surface: "web", route });
}
