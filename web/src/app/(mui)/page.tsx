"use client";

import { formatUiError } from "@illamhelp/shared-types";

import { useCallback, useEffect, useState } from "react";
import { LinkButton } from "@/components/ui/LinkButton";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, LockKeyhole, UserRound } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { AnalyticsConsentBanner } from "@/components/analytics/AnalyticsConsentBanner";
import { useSession } from "@/components/session/SessionProvider";
import { Banner, Button, Card, EmptyState, Skeleton, StatusLabel } from "@/components/ui/primitives";
import { getMyDashboard, DashboardResponse, formatDate } from "@/lib/api";

export default function HomePage(): JSX.Element {
  const { user, loading, accessToken } = useSession();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setDashLoading(true);
    setDashError(null);
    try {
      setDashboard(await getMyDashboard(accessToken));
    } catch (requestError) {
      setDashError(formatUiError(requestError, "Couldn’t load your jobs and updates. Try again."));
    } finally {
      setDashLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: "var(--spacing-xl)" }}>
          <Skeleton lines={3} />
        </div>
      </PageShell>
    );
  }

  if (user) {
    return (
      <PageShell>
        <div className="home-dashboard-header">
          <div>
            <h1>Your jobs and updates</h1>
            <p className="muted-text">See recent jobs, connections, and contact requests.</p>
          </div>
          <LinkButton href="/jobs/posted#post-new-job" className="button-link">Post a job</LinkButton>
        </div>
        
        {dashLoading ? (
          <div style={{ padding: "var(--spacing-xl)" }} aria-live="polite">
            <Skeleton lines={5} />
          </div>
        ) : dashError && !dashboard ? (
          <div className="stack" style={{ padding: "var(--spacing-xl)" }}>
            <Banner tone="error">{dashError}</Banner>
            <Button variant="secondary" onClick={() => void loadDashboard()}>Try again</Button>
          </div>
        ) : (
          <div className="card-workspace">
            <section className="stack" aria-labelledby="recent-jobs">
              <h2 id="recent-jobs">Recent jobs</h2>
              {dashError ? <Banner tone="error">{dashError}</Banner> : null}
              {dashboard?.recentJobs.length ? dashboard.recentJobs.map((job) => (
                <Card as="article" key={job.id} variant="record" className="stack">
                  <div className="card-record-heading">
                    <h3>{job.title}</h3>
                    <StatusLabel tone="info">{job.status.replaceAll("_", " ")}</StatusLabel>
                  </div>
                  <p className="muted-text">{job.category} · {job.locationText}</p>
                  <p className="muted-text">Posted {formatDate(job.createdAt)}</p>
                  <div>
                    <LinkButton href={`/jobs/${job.id}`} variant="ghost">View details</LinkButton>
                  </div>
                </Card>
              )) : (
                <EmptyState
                  title="No recent jobs"
                  body="Post a job to get started."
                  action={<LinkButton href="/jobs/posted#post-new-job">Post job</LinkButton>}
                />
              )}
            </section>
            <div className="stack">
              <Card variant="summary" className="stack">
                <h2>Account activity</h2>
                <dl className="card-summary-list">
                  <div><dt>Jobs</dt><dd>{dashboard?.metrics.totalJobs ?? 0}</dd></div>
                  <div><dt>Connections</dt><dd>{dashboard?.metrics.totalConnections ?? 0}</dd></div>
                  <div><dt>Pending connections</dt><dd>{dashboard?.metrics.pendingConnections ?? 0}</dd></div>
                </dl>
                <div><LinkButton href="/connections" variant="ghost">Review connections</LinkButton></div>
              </Card>
              <Card variant="action" className="stack">
                <h2>Contact sharing</h2>
                <p className="muted-text">Choose who can see your contact details.</p>
                <div><LinkButton href="/consent" variant="ghost">Manage contact sharing</LinkButton></div>
              </Card>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="member-hero" aria-labelledby="home-title">
        <div className="wrap member-wrap">
          <div className="member-hero-copy">
            <h1 id="home-title">
              Find help at home. <span>Find work nearby.</span>
            </h1>
            <p className="member-intro">
              Post a household job or apply for work anywhere in India.
              Review profiles and choose when to share contact details.
            </p>
            <div className="member-hero-actions">
              <LinkButton href="/auth/register">
                Create account <ArrowRight size={18} aria-hidden="true" />
              </LinkButton>
              <LinkButton href="/auth/login" variant="secondary">Sign in</LinkButton>
            </div>
            <AnalyticsConsentBanner inline />
          </div>

          <Card as="article" variant="record" soft className="member-preview" aria-label="Job and applicant example">
            <p className="member-preview-title">From job post to applicant</p>
            <div className="member-preview-item">
              <BriefcaseBusiness size={21} aria-hidden="true" />
              <div>
                <p className="member-preview-title">Fix a kitchen leak</p>
                <p>Example job</p>
              </div>
            </div>
            <div className="member-preview-item">
              <UserRound size={21} aria-hidden="true" />
              <div>
                <p className="member-preview-title">Arun M. applies</p>
                <p>Example applicant · Plumber</p>
              </div>
            </div>
            <div className="member-preview-privacy">
              <LockKeyhole size={18} aria-hidden="true" />
              <div>
                <p>Contact details stay private until you choose to share them with a connection.</p>
                <details>
                  <summary>How profile privacy works</summary>
                  <p>Verification documents stay out of profiles and jobs. Only accepted connections can see approved profile photos and videos.</p>
                </details>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="member-paths" aria-labelledby="member-paths-heading">
        <div className="wrap member-wrap">
          <h2 id="member-paths-heading">Hiring and finding work</h2>
          <div className="member-path-grid">
            <div>
              <h3>Hire help for your home</h3>
              <p>Describe the job, then review applicants’ profiles before choosing who to work with.</p>
            </div>
            <div>
              <h3>Find a household job</h3>
              <p>Browse jobs by location and service. Review the details and apply when the work suits you.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="member-support" aria-label="Privacy and support">
        <div className="wrap member-wrap">
          <nav className="legal-link-row member-legal" aria-label="Legal and support links">
            <Link href="/privacy-policy">Privacy Policy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/help">Help</Link>
          </nav>
        </div>
      </section>
    </PageShell>
  );
}
