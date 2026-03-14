"use client";

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
            subtitle="Theme, notifications, and account controls will continue to grow here as the mobile-first shell expands."
          />
          <RequireSession>
            <Card className="stack">
              <h3 style={{ fontFamily: "var(--font-display)" }}>Coming next</h3>
              <p className="muted-text">
                Notification tuning, appearance defaults, and account-level preferences will live in this space.
              </p>
            </Card>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
