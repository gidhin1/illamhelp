"use client";

import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { Card, SectionHeader } from "@/components/ui/primitives";

const helpRoutes = [
  {
    title: "Privacy or contact sharing",
    body: "Review who can see your contact details, stop sharing, or check whether a request is still pending.",
    href: "/consent",
    action: "Open privacy"
  },
  {
    title: "Verification and private documents",
    body: "Upload ID documents only in Verification. They stay private and separate from profile media.",
    href: "/verification",
    action: "Open verification"
  },
  {
    title: "Jobs and applications",
    body: "Inspect the job, applicant, privacy state, and media before taking the next action.",
    href: "/jobs/discover",
    action: "Open jobs"
  },
  {
    title: "Profile identity or media",
    body: "Update public profile details, profile images, videos, and service categories from your profile.",
    href: "/profile",
    action: "Open profile"
  }
];

export default function HelpPage(): JSX.Element {
  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Help"
            title="Support and guidance"
            subtitle="Start with the person, confirm the privacy state, then take the safest next action."
          />
          <div className="grid two">
            {helpRoutes.map((route) => (
              <Card key={route.title} className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>{route.title}</h3>
                <p className="muted-text">{route.body}</p>
                <Link className="button ghost" href={route.href}>{route.action}</Link>
              </Card>
            ))}
          </div>
          <Card className="stack">
            <h3 style={{ fontFamily: "var(--font-display)" }}>Safety checklist</h3>
            <p className="muted-text">Human identity: verify the member, applicant, or owner context before acting.</p>
            <p className="muted-text">Privacy state: treat verification documents as private and profile/job media as purpose-scoped.</p>
            <p className="muted-text">Next safe action: use the page-specific action instead of sharing contact details early.</p>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
