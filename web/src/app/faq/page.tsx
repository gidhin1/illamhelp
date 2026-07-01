import Link from "next/link";

import { FAQ_ENTRIES } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { FaqList } from "@/components/legal/LegalContent";
import { Card, SectionHeader } from "@/components/ui/primitives";

export default function FaqPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker event="faq_viewed" params={{ surface: "web", question: "faq_page" }} />
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="FAQ"
            title="Frequently asked questions"
            subtitle="Clear answers for account setup, media, privacy controls, verification, and safe next actions."
          />
          <FaqList entries={FAQ_ENTRIES} />
          <Card className="stack" soft>
            <h2>Need more help?</h2>
            <p className="muted-text">Start with the person, check the privacy state, then choose the safest product action.</p>
            <div className="legal-link-row">
              <Link className="button ghost" href="/help">Open help</Link>
              <Link className="button ghost" href="/privacy-policy">Privacy Policy</Link>
              <Link className="button ghost" href="/terms">Terms</Link>
            </div>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
