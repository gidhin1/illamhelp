import Link from "next/link";
import { HELP_TOPICS, helpShortcuts, legalPages } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { HelpTopicList, LegalContactDetails, LegalNavigation } from "@/components/legal/LegalContent";
import { Card, SectionHeader } from "@/components/ui/primitives";

export default function HelpPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker event="help_topic_viewed" params={{ surface: "web", topic_name: "help_center" }} />
      <section className="section">
        <div className="container stack legal-document">
          <SectionHeader title={legalPages.help.title} subtitle={legalPages.help.description} />
          <LegalNavigation current="help" />
          <section className="stack" aria-labelledby="help-task-heading">
            <h2 id="help-task-heading">Get help with a task</h2>
            <div className="help-task-grid">
              {helpShortcuts.map(({ href, label, detail }) => (
                <Card as="article" key={href} variant="action" className="stack">
                  <h3><Link href={href}>{label}</Link></h3>
                  <p className="muted-text">{detail}</p>
                </Card>
              ))}
            </div>
          </section>
          <section className="stack" aria-labelledby="help-guide-heading">
            <h2 id="help-guide-heading">How IllamHelp works</h2>
            <HelpTopicList topics={HELP_TOPICS} />
          </section>
          <LegalContactDetails />
        </div>
      </section>
    </PageShell>
  );
}
