"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Home,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Users
} from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { Banner, Button, EmptyState, Skeleton, StatusLabel } from "@/components/ui/primitives";
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
      setDashError(requestError instanceof Error ? requestError.message : "Unable to load your dashboard");
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
            <div className="section-kicker">Today</div>
            <h1>Your next steps</h1>
            <p className="muted-text">Jobs, people, and sharing updates that need attention.</p>
          </div>
          <Link href="/jobs/posted" className="button-link">
            <Button>Post a job</Button>
          </Link>
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
          <div className="stack" style={{ gap: 0 }}>
            {dashError ? (
              <div style={{ padding: "var(--spacing-md)" }}>
                <Banner tone="error">{dashError}</Banner>
              </div>
            ) : null}
            <div className="home-dashboard-strip">
               <div className="home-dashboard-stat">
                 <BriefcaseBusiness size={18} aria-hidden="true" />
                 <div>
                  <div className="muted-text">Jobs</div>
                  <strong>{dashboard?.metrics.totalJobs ?? 0}</strong>
                 </div>
               </div>
               <div className="home-dashboard-stat">
                 <Users size={18} aria-hidden="true" />
                 <div>
                  <div className="muted-text">Connections</div>
                  <strong>{dashboard?.metrics.totalConnections ?? 0}</strong>
                 </div>
               </div>
               <div className="home-dashboard-stat accent">
                 <ShieldCheck size={18} aria-hidden="true" />
                 <div>
                  <div className="muted-text">Pending requests</div>
                  <strong>{dashboard?.metrics.pendingConnections ?? 0}</strong>
                 </div>
               </div>
            </div>

            {dashboard?.recentJobs && dashboard.recentJobs.length > 0 ? (
              dashboard.recentJobs.map(job => (
                <div key={job.id} className="feed-card">
                  <div style={{ display: "flex", gap: "var(--spacing-lg)" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--brand-text)" }}>
                      <BriefcaseBusiness size={20} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--spacing-sm)" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>{job.title}</div>
                          <div className="muted-text" style={{ fontSize: "var(--font-sm)", marginTop: "2px" }}>{job.category} • {job.locationText}</div>
                        </div>
                        <StatusLabel tone="info">{job.status.replaceAll("_", " ")}</StatusLabel>
                      </div>
                      <div className="muted-text" style={{ fontSize: "var(--font-xs)", marginTop: "var(--spacing-sm)" }}>
                        Posted {formatDate(job.createdAt)}
                      </div>
                      <div style={{ marginTop: "var(--spacing-md)", display: "flex", gap: "var(--spacing-sm)" }}>
                        <Link href="/jobs" className="button-link">
                          <Button variant="secondary">View details</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "var(--spacing-xl)" }}>
                <EmptyState
                  title="No recent jobs"
                  body="Post a job or browse available work to start using IllamHelp."
                  action={<Link href="/jobs" className="button-link"><Button>Post job</Button></Link>}
                />
              </div>
            )}
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <div className="home-brand-mark" aria-hidden="true">
            <Home size={26} />
          </div>
          <p className="home-hero-kicker">Household help with privacy controls built in</p>
          <h1 id="home-title" className="home-hero-title">
            Find trusted help before the work reaches your doorstep.
          </h1>
          <p className="home-hero-subtitle">
            Post household jobs, review providers, and share contact details only after you choose who can see them.
          </p>
          <div className="home-hero-actions">
            <Link href="/auth/register" className="button home-primary-action">
              Create account
            </Link>
            <Link href="/auth/login" className="button secondary home-secondary-action">
              Sign in
            </Link>
          </div>
          <div className="home-hero-trustbar" aria-label="IllamHelp safety highlights">
            <span>Private contact sharing</span>
            <span>Profile and media review</span>
            <span>Clear job status</span>
          </div>
        </div>

        <div className="home-trust-scene" aria-label="IllamHelp trust workflow preview">
          <div className="home-scene-status">
            <span className="home-live-dot" aria-hidden="true" />
            Safe next action: review applicant profile
          </div>
          <div className="home-scene-topline">
            <span>Kochi, 8:40 AM</span>
            <span>Kitchen leak repair</span>
          </div>
          <div className="home-job-card">
            <div className="home-job-icon">
              <BriefcaseBusiness size={24} aria-hidden="true" />
            </div>
            <div>
              <strong>Urgent plumber needed</strong>
              <span>Kakkanad, today</span>
            </div>
          </div>
          <div className="home-route-line" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="home-proof-grid">
            <div className="home-proof-card strong">
              <ShieldCheck size={22} aria-hidden="true" />
              <strong>Profile checked</strong>
              <span>Verification and media review stay visible.</span>
            </div>
            <div className="home-proof-card">
              <Users size={22} aria-hidden="true" />
              <strong>Apply with context</strong>
              <span>Providers share skills, location, and work examples.</span>
            </div>
            <div className="home-proof-card">
              <LockKeyhole size={22} aria-hidden="true" />
              <strong>Contact stays private</strong>
              <span>You approve sharing when the match feels right.</span>
            </div>
          </div>
          <div className="home-location-chip">
            <MapPin size={16} aria-hidden="true" />
            Kerala and Tamil Nadu service network
          </div>
        </div>
      </section>

      <section className="home-proof-section" aria-label="Why households use IllamHelp">
        <div className="home-proof-intro">
          <h2>Trust is not a badge here. It is a workflow.</h2>
          <p>
            Every important step names who can act next: job owner, provider, connection, or moderator.
          </p>
        </div>
        <div className="home-proof-steps">
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Post the work clearly</strong>
            <span>Category, location, visibility, and job media sit with the request.</span>
          </div>
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Review people before sharing</strong>
            <span>Profiles, approved media, and applications stay inspectable.</span>
          </div>
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Keep contact details controlled</strong>
            <span>Sharing is explicit, reversible, and shown in plain language.</span>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
