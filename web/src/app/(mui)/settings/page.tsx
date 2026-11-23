"use client";

import { analyticsPreferenceDescription, appearanceChoices } from "@illamhelp/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useThemePreference } from "@/components/ThemeProvider";
import { Banner, Button, Card, SectionHeader } from "@/components/ui/primitives";
import { readAnalyticsConsent, setAnalyticsConsent, subscribeAnalyticsConsent } from "@/lib/analytics";

const shortcuts = [
  { title: "Contact sharing", detail: "Choose who can see your contact details.", href: "/consent", label: "Manage contact sharing" },
  { title: "Profile", detail: "Update your details, services, and work samples.", href: "/profile", label: "Edit profile" },
  { title: "Alerts", detail: "Check updates and manage what you’ve read.", href: "/notifications", label: "View alerts" }
];

export default function SettingsPage(): JSX.Element {
  const { preference, setPreference } = useThemePreference();
  const [analytics, setAnalytics] = useState<boolean | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    const refresh = (): void => {
      try {
        setAnalytics(readAnalyticsConsent().analytics === "granted");
        setAnalyticsError("");
      } catch {
        setAnalyticsError("Couldn’t read your analytics choice. Check browser storage and reload.");
      }
    };
    refresh();
    return subscribeAnalyticsConsent(refresh);
  }, []);

  const changeAnalytics = (enabled: boolean): void => {
    try {
      const choice = setAnalyticsConsent({ analytics: enabled ? "granted" : "denied", ads: "denied" });
      setAnalytics(choice.analytics === "granted");
      setAnalyticsError("");
    } catch {
      setAnalyticsError("Couldn’t save your analytics choice. Check browser storage and try again.");
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack settings-feed">
          <SectionHeader title="Account settings" />
          <RequireSession>
            <div className="stack">
              <Card variant="action" className="stack">
                <h2>Appearance</h2>
                <p className="muted-text">Choose how IllamHelp looks in this browser.</p>
                <div role="group" aria-label="Appearance" className="alert-actions">
                  {appearanceChoices.map(({ value, label }) => (
                    <Button key={value} type="button" variant={preference === value ? "primary" : "secondary"}
                      aria-pressed={preference === value} onClick={() => setPreference(value)}>{label}</Button>
                  ))}
                </div>
              </Card>
              <Card variant="action" className="stack">
                <h2>Analytics</h2>
                <p className="muted-text" id="analytics-preference-description">{analyticsPreferenceDescription}</p>
                {analyticsError ? <Banner tone="error">{analyticsError}</Banner> : null}
                <div className="alert-actions">
                  <span role="status" data-testid="settings-analytics-status">{analytics === null ? "Loading preference…" : analytics ? "Analytics on" : "Analytics off"}</span>
                  <Button type="button" variant="secondary" aria-describedby="analytics-preference-description" disabled={analytics === null}
                    onClick={() => changeAnalytics(!analytics)}>{analytics ? "Turn off analytics" : "Turn on analytics"}</Button>
                </div>
              </Card>
              <div className="card-row-list">
                {shortcuts.map(({ title, detail, href, label }) => (
                  <div className="card-list-row settings-row" key={href}>
                    <div><h2>{title}</h2><p className="muted-text">{detail}</p></div>
                    <Link className="button secondary" href={href}>{label}</Link>
                  </div>
                ))}
                <div className="card-list-row stack">
                  <h2>Help and support</h2>
                  <div className="legal-link-row">
                    <Link className="button ghost" href="/help">Open Help</Link>
                    <Link className="button ghost" href="/privacy-policy">Privacy Policy</Link>
                    <Link className="button ghost" href="/terms">Terms</Link>
                    <Link className="button ghost" href="/faq">FAQ</Link>
                  </div>
                </div>
              </div>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
