"use client";

import { useState, useSyncExternalStore } from "react";

import {
  e2eAnalyticsConsentGranted,
  hasStoredAnalyticsConsent,
  readAnalyticsConsent,
  setAnalyticsConsent
} from "@/lib/analytics";

function subscribeToConsentStorage(): () => void {
  return () => {};
}

function consentBannerVisibleSnapshot(): boolean {
  return !e2eAnalyticsConsentGranted() && !hasStoredAnalyticsConsent();
}

export function AnalyticsConsentBanner(): JSX.Element | null {
  const shouldShowBanner = useSyncExternalStore(
    subscribeToConsentStorage,
    consentBannerVisibleSnapshot,
    () => false
  );
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!shouldShowBanner || dismissed) {
    return null;
  }

  const current = readAnalyticsConsent();
  const closeWith = (analytics: "granted" | "denied"): void => {
    setAnalyticsConsent({ analytics, ads: "denied" });
    setDismissed(true);
  };

  return (
    <aside className="analytics-consent-banner" aria-label="Analytics privacy choice">
      <div>
        <strong>Help improve IllamHelp?</strong>
        <p>
          Analytics are off until you say yes. We measure product flows, never names,
          phone numbers, media links, addresses, or verification document details.
        </p>
        {expanded ? (
          <p className="analytics-consent-detail">
            Current state: analytics {current.analytics}, ads {current.ads}. Ads storage stays denied in v1.
          </p>
        ) : null}
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="button" onClick={() => closeWith("granted")}>
          Accept analytics
        </button>
        <button type="button" className="button secondary" onClick={() => closeWith("denied")}>
          Reject
        </button>
        <button type="button" className="button ghost" onClick={() => setExpanded((value) => !value)}>
          Manage
        </button>
      </div>
    </aside>
  );
}
