import { legalPages } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { FaqSearch } from "@/components/legal/FaqSearch";
import { LegalNavigation } from "@/components/legal/LegalContent";
import { SectionHeader } from "@/components/ui/primitives";

export default function FaqPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker event="faq_viewed" params={{ surface: "web", question: "faq_page" }} />
      <section className="section">
        <div className="container stack legal-document">
          <SectionHeader title={legalPages.faq.title} subtitle={legalPages.faq.description} />
          <LegalNavigation current="faq" />
          <FaqSearch />
        </div>
      </section>
    </PageShell>
  );
}
