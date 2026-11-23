"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { useSession } from "@/components/session/SessionProvider";

import {
  e2eAnalyticsConsentGranted,
  hasStoredAnalyticsConsent,
  readAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent
} from "@/lib/analytics";

function consentBannerVisibleSnapshot(): boolean {
  return !e2eAnalyticsConsentGranted() && !hasStoredAnalyticsConsent();
}

export function AnalyticsConsentBanner({ inline = false }: { inline?: boolean }): JSX.Element | null {
  const pathname = usePathname();
  const { user } = useSession();
  const isGuestLanding = pathname === "/" && !user;
  const shouldShowBanner = useSyncExternalStore(
    subscribeAnalyticsConsent,
    consentBannerVisibleSnapshot,
    () => false
  );
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (inline !== isGuestLanding || !shouldShowBanner || dismissed) {
    return null;
  }

  const current = readAnalyticsConsent();
  const closeWith = (analytics: "granted" | "denied"): void => {
    setAnalyticsConsent({ analytics, ads: "denied" });
    setDismissed(true);
  };

  return (
    <aside
      className={inline ? "analytics-consent-banner analytics-consent-inline" : "analytics-consent-banner"}
      aria-label="Analytics privacy choice"
    >
      <div>
        <strong>Share app usage data?</strong>
        <p>
          Analytics are off by default. If you allow them, we measure app use without sending names, phone numbers, addresses, media links, or verification document details.
        </p>
        <p id="analytics-consent-detail" className="analytics-consent-detail" hidden={!expanded}>
          Analytics: {current.analytics}, ads {current.ads}. Ad storage stays off.
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="button" onClick={() => closeWith("granted")}>
          Allow analytics
        </button>
        <button type="button" className="button secondary" onClick={() => closeWith("denied")}>
          Decline analytics
        </button>
        <button
          type="button"
          className="button ghost"
          aria-expanded={expanded}
          aria-controls="analytics-consent-detail"
          onClick={() => setExpanded((value) => !value)}
        >
          View analytics settings
        </button>
      </div>
    </aside>
  );
}
