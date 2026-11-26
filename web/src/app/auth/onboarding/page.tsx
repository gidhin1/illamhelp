"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AnalyticsConsentBanner } from "@/components/analytics/AnalyticsConsentBanner";
import { PageShell } from "@/components/PageShell";
import { SectionHeader } from "@illamhelp/ui-web/section-header";
import styles from "../auth-flow.module.css";

type SetupStatus = { complete: boolean; termsVersion: string; privacyPolicyVersion: string };
const setupPath = "/api/member/auth/member-onboarding";

export default function MemberOnboardingPage(): JSX.Element {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(setupPath, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 404) {
        window.location.replace("/auth/login");
        return;
      }
      if (!response.ok) throw new Error();
      const setup = await response.json() as SetupStatus;
      if (setup.complete) window.location.replace("/jobs");
      else setStatus(setup);
    }).catch(() => {
      if (!controller.signal.aborted) setError("We couldn’t load your profile setup. Refresh this page to try again.");
    });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!status || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(setupPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(data.get("username") ?? "").trim(),
          firstName: String(data.get("firstName") ?? "").trim(),
          lastName: String(data.get("lastName") ?? "").trim(),
          acceptedTermsVersion: status.termsVersion,
          acceptedPrivacyPolicyVersion: status.privacyPolicyVersion
        })
      });
      if (response.status === 401) {
        window.location.replace("/auth/login?signin=retry");
        return;
      }
      if (response.status === 409) {
        setError("That username is taken. Choose another.");
        return;
      }
      if (response.status === 403) {
        setError("Verify your email, then sign in again to finish your profile.");
        return;
      }
      if (response.status === 400) {
        setError("Check your details and reload the page if the policies have changed.");
        return;
      }
      if (!response.ok) throw new Error();
      window.location.replace("/jobs");
    } catch {
      setError("We couldn’t save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className={`container ${styles.container}`}>
          <SectionHeader title="Set up your member profile" subtitle="Choose the name and username other members will see." />
          <div className="card stack login-card">
            {error ? <div className="banner error" role="alert">{error}</div> : null}
            {!status && !error ? <p role="status">Loading profile setup…</p> : null}
            {status ? (
              <form className="stack" onSubmit={submit}>
                <div className={styles.names}>
                  <label className="field">
                    <span className="field-label">First name</span>
                    <input required name="firstName" autoComplete="given-name" minLength={2} maxLength={80} />
                  </label>
                  <label className="field">
                    <span className="field-label">Last name (optional)</span>
                    <input name="lastName" autoComplete="family-name" maxLength={80} />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Public username</span>
                  <input required name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                    minLength={3} maxLength={40} pattern={"[A-Za-z0-9._\\-]{3,40}"} aria-describedby="username-hint" />
                  <span id="username-hint">Use 3–40 letters, numbers, dots, underscores or hyphens.</span>
                </label>
                <div>
                  <p id="policy-links">
                    Read the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy-policy" target="_blank">Privacy Policy</Link>.
                  </p>
                  <label className={styles.acceptance}>
                    <input type="checkbox" required name="acceptedPolicies" aria-describedby="policy-links" />
                    <span>I accept the Terms and Privacy Policy.</span>
                  </label>
                </div>
                <div className={styles.actions}>
                  <button className="button" type="submit" disabled={saving}>
                    {saving ? "Saving profile…" : "Finish profile"}
                  </button>
                </div>
              </form>
            ) : null}
            <button type="button" className={`button ghost ${styles.provider}`} onClick={async () => {
              try {
                const response = await fetch("/api/member/logout", { method: "POST" });
                if (!response.ok) throw new Error();
                window.location.replace("/auth/login");
              } catch {
                setError("We couldn’t sign you out. Try again.");
              }
            }}>Sign out</button>
          </div>
          <div className={styles.privacyChoice}><AnalyticsConsentBanner inline /></div>
        </div>
      </section>
    </PageShell>
  );
}
