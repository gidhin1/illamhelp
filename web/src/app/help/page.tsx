"use client";

import { PageShell } from "@/components/PageShell";
import { Card, SectionHeader } from "@/components/ui/primitives";

export default function HelpPage(): JSX.Element {
  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Help"
            title="Support and guidance"
            subtitle="Use this space for trust education, privacy guidance, and support entry points."
          />
          <Card className="stack">
            <h3 style={{ fontFamily: "var(--font-display)" }}>Need a hand?</h3>
            <p className="muted-text">
              We’ll expand this page with safety guidance, workflow explanations, and support routing as the mobile experience matures.
            </p>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
