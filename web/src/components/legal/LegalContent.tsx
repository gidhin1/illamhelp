import Link from "next/link";
import {
  canEmailLegalContact, CURRENT_LEGAL_VERSIONS, LEGAL_CONTACT, legalPages, legalSectionId,
  type FaqEntry, type HelpTopic, type LegalPageKey, type LegalSection
} from "@illamhelp/shared-types";

import { Card, SectionHeader } from "@/components/ui/primitives";

export function LegalNavigation({ current }: { current: LegalPageKey }): JSX.Element {
  return (
    <nav aria-label="Help and policies" className="legal-navigation">
      {(Object.keys(legalPages) as LegalPageKey[]).map((key) => (
        <Link key={key} href={legalPages[key].href} aria-current={key === current ? "page" : undefined}>
          {legalPages[key].label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalContactDetails({ includeEntity = false }: { includeEntity?: boolean }): JSX.Element {
  const contacts = [
    { label: "Support email", address: LEGAL_CONTACT.supportEmail },
    { label: "Grievance email", address: LEGAL_CONTACT.grievanceEmail }
  ];
  return (
    <Card variant="summary" className="stack" id="support-details">
      <h2>Contact details</h2>
      {contacts.some(({ address }) => !canEmailLegalContact(address)) ? (
        <p className="muted-text">Placeholder contact details are pending confirmation.</p>
      ) : null}
      <dl className="legal-details">
        {includeEntity ? (
          <>
            <div><dt>Legal entity</dt><dd>{LEGAL_CONTACT.entityName}</dd></div>
            <div><dt>Registered office</dt><dd>{LEGAL_CONTACT.address}</dd></div>
          </>
        ) : null}
        {contacts.map(({ label, address }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{canEmailLegalContact(address) ? <a href={`mailto:${address}`}>{address}</a> : address}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function LegalDocument({ page, version, sections }: {
  page: "terms" | "privacy";
  version: string;
  sections: readonly LegalSection[];
}): JSX.Element {
  const { title, description } = legalPages[page];
  return (
    <section className="section">
      <div className="container stack legal-document">
        <SectionHeader title={title} subtitle={description} />
        <LegalNavigation current={page} />
        <dl className="legal-details legal-version">
          <div><dt>Version</dt><dd>{version}</dd></div>
          <div><dt>Effective</dt><dd><time dateTime={CURRENT_LEGAL_VERSIONS.effectiveDate}>{CURRENT_LEGAL_VERSIONS.effectiveDate}</time></dd></div>
          <div><dt>Last updated</dt><dd><time dateTime={CURRENT_LEGAL_VERSIONS.lastUpdatedDate}>{CURRENT_LEGAL_VERSIONS.lastUpdatedDate}</time></dd></div>
        </dl>
        <div className="legal-reading-layout">
          <nav aria-label="Document sections" className="legal-section-index" id="legal-sections" tabIndex={-1}>
            <h2>On this page</h2>
            <ol>
              {sections.map((section) => (
                <li key={section.title}><a href={`#${legalSectionId(section)}`}>{section.title}</a></li>
              ))}
            </ol>
            <a href="#support-details">Contact details</a>
          </nav>
          <div className="stack legal-prose">
            {sections.map((section) => {
              const id = legalSectionId(section);
              return (
                <section key={id} aria-labelledby={id} className="stack legal-section">
                  <h2 id={id} tabIndex={-1}>{section.title}</h2>
                  {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </section>
              );
            })}
            <LegalContactDetails includeEntity />
            <div><a href="#legal-sections" className="button secondary">Back to section list</a></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqList({ entries }: { entries: readonly FaqEntry[] }): JSX.Element {
  return (
    <div className="card-row-list">
      {entries.map((entry) => (
        <details key={entry.question} className="card-disclosure card-list-row">
          <summary>{entry.question}</summary>
          <p>{entry.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function HelpTopicList({ topics }: { topics: readonly HelpTopic[] }): JSX.Element {
  return (
    <div className="card-row-list">
      {topics.map((topic) => (
        <details key={topic.title} className="card-disclosure card-list-row">
          <summary>{topic.title}</summary>
          <p>{topic.humanIdentity}</p>
          <p>{topic.privacyState}</p>
          <p>{topic.nextSafeAction}</p>
        </details>
      ))}
    </div>
  );
}
