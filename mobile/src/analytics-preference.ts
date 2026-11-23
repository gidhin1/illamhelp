import type { AnalyticsConsentChoice } from "@illamhelp/shared-types";
import { useEffect, useSyncExternalStore } from "react";
import { readAnalyticsConsent, restoreAnalyticsConsent, setAnalyticsConsent } from "./analytics";
import { readDevicePreference, writeDevicePreference } from "./device-preferences";

const key = "illamhelp.analyticsConsent.v1";
const defaultSnapshot = {
  choice: { analytics: "denied", ads: "denied", updatedAt: "" } as AnalyticsConsentChoice,
  ready: false,
  saving: false,
  error: ""
};
let snapshot = defaultSnapshot;
let load: Promise<void> | undefined;
const subscribers = new Set<() => void>();

function publish(changes: Partial<typeof defaultSnapshot>): void {
  snapshot = { ...snapshot, ...changes };
  subscribers.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

function initialize(): Promise<void> {
  load ??= readDevicePreference(key).then((stored) => {
    const parsed = stored ? JSON.parse(stored) as Partial<AnalyticsConsentChoice> : readAnalyticsConsent();
    const choice: AnalyticsConsentChoice = {
      analytics: parsed.analytics === "granted" ? "granted" : "denied",
      ads: "denied",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
    restoreAnalyticsConsent(choice);
    publish({ ready: true, choice });
  }).catch(() => {
    publish({ ready: true, error: "Couldn’t read your analytics choice. You can set it again below." });
  });
  return load;
}

export async function saveAnalyticsPreference(enabled: boolean): Promise<void> {
  if (!snapshot.ready || snapshot.saving) return;
  publish({ saving: true, error: "" });
  const choice: AnalyticsConsentChoice = {
    analytics: enabled ? "granted" : "denied",
    ads: "denied",
    updatedAt: new Date().toISOString()
  };
  try {
    await writeDevicePreference(key, JSON.stringify(choice));
    const saved = setAnalyticsConsent(choice);
    publish({ choice: saved });
  } catch {
    publish({ error: "Couldn’t save your analytics choice. Try again." });
  } finally {
    publish({ saving: false });
  }
}

export function useAnalyticsPreference(): typeof defaultSnapshot {
  useEffect(() => { void initialize(); }, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => defaultSnapshot);
}
