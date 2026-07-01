import { CURRENT_LEGAL_VERSIONS, TERMS_SECTIONS } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { LegalDocument } from "@/components/legal/LegalContent";

export default function TermsPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker
        event="legal_document_viewed"
        params={{
          surface: "web",
          document_type: "terms",
          version: CURRENT_LEGAL_VERSIONS.terms
        }}
      />
      <LegalDocument
        eyebrow="Terms"
        title="Terms and Conditions"
        subtitle="The rules for using IllamHelp as a household service marketplace with privacy-first connections."
        version={CURRENT_LEGAL_VERSIONS.terms}
        sections={TERMS_SECTIONS}
      />
    </PageShell>
  );
}
