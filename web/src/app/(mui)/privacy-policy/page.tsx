import { CURRENT_LEGAL_VERSIONS, PRIVACY_POLICY_SECTIONS } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { LegalDocument } from "@/components/legal/LegalContent";

export default function PrivacyPolicyPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker
        event="legal_document_viewed"
        params={{
          surface: "web",
          document_type: "privacy_policy",
          version: CURRENT_LEGAL_VERSIONS.privacyPolicy
        }}
      />
      <LegalDocument
        page="privacy"
        version={CURRENT_LEGAL_VERSIONS.privacyPolicy}
        sections={PRIVACY_POLICY_SECTIONS}
      />
    </PageShell>
  );
}
