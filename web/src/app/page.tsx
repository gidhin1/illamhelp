"use client";

import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { Card } from "@/components/ui/primitives";

const pillars = [
  {
    title: "Connect with Confidence",
    body: "Contact details are shared only when both people say yes."
  },
  {
    title: "You Stay in Control",
    body: "You choose what to share, and you can stop sharing anytime."
  },
  {
    title: "Safe Public Profiles",
    body: "Work photos and videos are reviewed before they appear publicly."
  }
];

export default function HomePage(): JSX.Element {
  const { user, loading } = useSession();

  return (
    <PageShell>
      <section className="section">
        <div className="container hero-grid">
          <div className="stack fade-in">
            <div className="pill">Built for homes in Kerala and Tamil Nadu</div>
            <h1 className="display-title">Find trusted help for your home, nearby.</h1>
            <p className="muted-text" style={{ fontSize: "1.06rem" }}>
              Discover skilled people for everyday home services, connect safely,
              and share contact details only when you choose.
            </p>
            {!loading ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {user ? (
                  <>
                    <Link href="/jobs" className="button">
                      Browse jobs
                    </Link>
                    <Link href="/profile" className="button ghost">
                      View profile
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/auth/register" className="button">
                      Create account
                    </Link>
                    <Link href="/auth/login" className="button ghost">
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            ) : null}
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">New requests</div>
                <div className="kpi-value">Post quickly</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Privacy</div>
                <div className="kpi-value">Share or stop</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Safety review</div>
                <div className="kpi-value">Always on</div>
              </div>
            </div>
          </div>

          <Card className="stack">
            <h3 style={{ fontFamily: "var(--font-display)" }}>How it works</h3>
            <div className="data-row">
              <div className="data-title">1. Create your account</div>
              <div className="data-meta">One account lets you request work and offer services.</div>
            </div>
            <div className="data-row">
              <div className="data-title">2. Post or discover work</div>
              <div className="data-meta">Share job needs and review relevant opportunities.</div>
            </div>
            <div className="data-row">
              <div className="data-title">3. Connect with approval</div>
              <div className="data-meta">Both sides confirm before private details are shared.</div>
            </div>
            <div className="data-row">
              <div className="data-title">4. Control your privacy</div>
              <div className="data-meta">Grant access when needed and revoke anytime.</div>
            </div>
          </Card>
        </div>
      </section>

      <section className="section">
        <div className="container grid three">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="stack">
              <h3 style={{ fontFamily: "var(--font-display)" }}>{pillar.title}</h3>
              <p className="muted-text">{pillar.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
