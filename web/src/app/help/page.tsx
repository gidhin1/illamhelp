"use client";

import Link from "next/link";

import { FAQ_ENTRIES, HELP_TOPICS, LEGAL_CONTACT } from "@illamhelp/shared-types";

import { PageShell } from "@/components/PageShell";
import { AnalyticsViewTracker } from "@/components/analytics/AnalyticsViewTracker";
import { FaqList, HelpTopicGrid } from "@/components/legal/LegalContent";
import { Card, SectionHeader } from "@/components/ui/primitives";

const productRoutes = [
  { href: "/consent", label: "Privacy controls", body: "Review active contact sharing, pending requests, and revocation actions." },
  { href: "/verification", label: "Verification", body: "Upload private ID documents and review verification status." },
  { href: "/jobs/discover", label: "Jobs", body: "Find jobs, review job media, and act from the job context." },
  { href: "/profile", label: "Profile and media", body: "Update profile details, profile picture, and approved profile media." }
];

export default function HelpPage(): JSX.Element {
  return (
    <PageShell>
      <AnalyticsViewTracker event="help_topic_viewed" params={{ surface: "web", topic_name: "help_center" }} />
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Help"
            title="Help center"
            subtitle="Find the right page, understand the privacy state, and take the next safe action."
          />
          <div className="grid two">
            {productRoutes.map((route) => (
              <Card key={route.href} className="stack" motion="enter">
                <h2>{route.label}</h2>
                <p className="muted-text">{route.body}</p>
                <Link className="button ghost" href={route.href}>Open {route.label.toLowerCase()}</Link>
              </Card>
            ))}
          </div>
          <Card className="stack" soft>
            <h2>Legal and policy documents</h2>
            <p className="muted-text">Use these documents to understand account terms, privacy protections, and common questions.</p>
            <div className="legal-link-row">
              <Link className="button ghost" href="/privacy-policy">Privacy Policy</Link>
              <Link className="button ghost" href="/terms">Terms</Link>
              <Link className="button ghost" href="/faq">FAQ</Link>
            </div>
          </Card>
          <HelpTopicGrid topics={HELP_TOPICS} />
          <Card className="stack" soft>
            <h2>Quick answers</h2>
            <p className="muted-text">The most common privacy, verification, and media questions.</p>
          </Card>
          <FaqList entries={FAQ_ENTRIES.slice(0, 4)} />
          <Card className="stack" soft>
            <h2>Contact support</h2>
            <p className="muted-text">Support: {LEGAL_CONTACT.supportEmail}</p>
            <p className="muted-text">Grievance contact: {LEGAL_CONTACT.grievanceEmail}</p>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
