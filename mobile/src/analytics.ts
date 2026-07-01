import type {
  AnalyticsConsentChoice,
  AnalyticsEventName,
  AnalyticsParamsByEvent
} from "@illamhelp/shared-types";

const STORAGE_KEY = "illamhelp.analyticsConsent.v1";

type NativeAnalyticsBridge = {
  logEvent?: (event: string, params: Record<string, unknown>) => void;
  setConsent?: (choice: { analytics: boolean; ads: boolean }) => void;
  setUserId?: (analyticsUserId: string) => void;
};

type MemoryGlobal = typeof globalThis & {
  localStorage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  illamhelpNativeAnalytics?: NativeAnalyticsBridge;
};

let memoryConsent: AnalyticsConsentChoice = {
  analytics: "denied",
  ads: "denied",
  updatedAt: ""
};
let analyticsUserId: string | null = null;

function envValue(key: string): string | undefined {
  return (
    globalThis as unknown as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.[key];
}

function analyticsConfigured(): boolean {
  return Boolean(envValue("EXPO_PUBLIC_FIREBASE_APP_ID") || (globalThis as MemoryGlobal).illamhelpNativeAnalytics);
}

function storage(): MemoryGlobal["localStorage"] {
  return (globalThis as MemoryGlobal).localStorage;
}

export function readAnalyticsConsent(): AnalyticsConsentChoice {
  const stored = storage()?.getItem(STORAGE_KEY);
  if (!stored) {
    return memoryConsent;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<AnalyticsConsentChoice>;
    memoryConsent = {
      analytics: parsed.analytics === "granted" ? "granted" : "denied",
      ads: parsed.ads === "granted" ? "granted" : "denied",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    // Keep the in-memory denied default.
  }
  return memoryConsent;
}

export function hasStoredAnalyticsConsent(): boolean {
  return storage()?.getItem(STORAGE_KEY) != null || memoryConsent.updatedAt.length > 0;
}

export function setAnalyticsConsent(choice: Omit<AnalyticsConsentChoice, "updatedAt">): AnalyticsConsentChoice {
  memoryConsent = {
    ...choice,
    updatedAt: new Date().toISOString()
  };
  storage()?.setItem(STORAGE_KEY, JSON.stringify(memoryConsent));
  (globalThis as MemoryGlobal).illamhelpNativeAnalytics?.setConsent?.({
    analytics: choice.analytics === "granted",
    ads: choice.ads === "granted"
  });
  if (choice.analytics === "granted") {
    trackEvent("legal_consent_updated", {
      surface: "mobile",
      analytics_consent: choice.analytics,
      ad_consent: choice.ads
    });
  }
  return memoryConsent;
}

export function identifyAnalyticsUser(nextAnalyticsUserId: string | null | undefined): void {
  if (!nextAnalyticsUserId) {
    return;
  }
  analyticsUserId = nextAnalyticsUserId;
  if (readAnalyticsConsent().analytics === "granted") {
    (globalThis as MemoryGlobal).illamhelpNativeAnalytics?.setUserId?.(nextAnalyticsUserId);
  }
}

export function trackEvent<TName extends AnalyticsEventName>(
  event: TName,
  params: Omit<AnalyticsParamsByEvent[TName], "schema_version"> & { schema_version?: "v1" }
): void {
  if (!analyticsConfigured() || readAnalyticsConsent().analytics !== "granted") {
    return;
  }
  (globalThis as MemoryGlobal).illamhelpNativeAnalytics?.logEvent?.(event, {
    schema_version: "v1",
    analytics_user_id: analyticsUserId,
    ...params
  });
}

export function trackPageView(route: string): void {
  trackEvent("page_viewed", {
    surface: "mobile",
    route
  });
}
