"use client";

import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { Card, SectionHeader } from "@/components/ui/primitives";

export default function SettingsPage(): JSX.Element {
  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Settings"
            title="Preferences"
            subtitle="Use the active safety surfaces today while account-level preferences continue to grow."
          />
          <RequireSession>
            <div className="grid two">
              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Human identity</h3>
                <p className="muted-text">Edit your profile details, service categories, and public profile media.</p>
                <Link className="button ghost" href="/profile">Manage profile</Link>
              </Card>
              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Privacy state</h3>
                <p className="muted-text">Review who can see your contact details and stop sharing when a request no longer needs access.</p>
                <Link className="button ghost" href="/consent">Review privacy</Link>
              </Card>
              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Notifications</h3>
                <p className="muted-text">Use alerts to review connection, job, and verification updates before changing account settings.</p>
                <Link className="button ghost" href="/notifications">Open alerts</Link>
              </Card>
              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Next safe action</h3>
                <p className="muted-text">Need help deciding where to go next? Use the support guide to route privacy, media, and job issues.</p>
                <Link className="button ghost" href="/help">Open help</Link>
              </Card>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
