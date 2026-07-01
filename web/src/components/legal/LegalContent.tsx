import Link from "next/link";

import type { FaqEntry, HelpTopic, LegalSection } from "@illamhelp/shared-types";
import { CURRENT_LEGAL_VERSIONS, LEGAL_CONTACT } from "@illamhelp/shared-types";

import { Card, SectionHeader } from "@/components/ui/primitives";

export function LegalDocument({
  eyebrow,
  title,
  subtitle,
  version,
  sections
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  version: string;
  sections: LegalSection[];
}): JSX.Element {
  return (
    <section className="section">
      <div className="container stack legal-document">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
        />
        <Card className="stack" soft>
          <p className="muted-text">Version {version}</p>
          <p className="muted-text">Effective {CURRENT_LEGAL_VERSIONS.effectiveDate}. Last updated {CURRENT_LEGAL_VERSIONS.lastUpdatedDate}.</p>
          <p className="muted-text">Legal entity: {LEGAL_CONTACT.entityName}</p>
          <p className="muted-text">Address: {LEGAL_CONTACT.address}</p>
          <p className="muted-text">Support: {LEGAL_CONTACT.supportEmail} · Grievance: {LEGAL_CONTACT.grievanceEmail}</p>
        </Card>
        {sections.map((section) => (
          <Card key={section.title} className="stack" motion="enter">
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="muted-text">{paragraph}</p>
            ))}
          </Card>
        ))}
        <Card className="stack" soft>
          <h2>Related help</h2>
          <div className="legal-link-row">
            <Link className="button ghost" href="/help">Help center</Link>
            <Link className="button ghost" href="/faq">FAQ</Link>
            <Link className="button ghost" href="/terms">Terms</Link>
            <Link className="button ghost" href="/privacy-policy">Privacy Policy</Link>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function FaqList({ entries }: { entries: FaqEntry[] }): JSX.Element {
  return (
    <div className="grid two">
      {entries.map((entry) => (
        <Card key={entry.question} className="stack" motion="enter">
          <h2>{entry.question}</h2>
          <p className="muted-text">{entry.answer}</p>
        </Card>
      ))}
    </div>
  );
}

export function HelpTopicGrid({ topics }: { topics: HelpTopic[] }): JSX.Element {
  return (
    <div className="grid two">
      {topics.map((topic) => (
        <Card key={topic.title} className="stack" motion="enter">
          <h2>{topic.title}</h2>
          <p className="muted-text"><strong>Human identity:</strong> {topic.humanIdentity}</p>
          <p className="muted-text"><strong>Privacy state:</strong> {topic.privacyState}</p>
          <p className="muted-text"><strong>Next safe action:</strong> {topic.nextSafeAction}</p>
        </Card>
      ))}
    </div>
  );
}
