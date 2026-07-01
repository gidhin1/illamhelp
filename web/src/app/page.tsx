"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Home,
  LockKeyhole,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Sparkles,
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
                        <Link href={`/jobs/${job.id}`} className="button-link">
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
      <section className="home-hero home-hero-overdrive" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <div className="home-brand-mark" aria-hidden="true">
            <Home size={26} />
          </div>
          <p className="home-hero-kicker">Trust signal studio for household work</p>
          <h1 id="home-title" className="home-hero-title">
            Know the person, privacy, and next step before work reaches home.
          </h1>
          <p className="home-hero-subtitle">
            IllamHelp turns every job into a clear trust workflow: identity first, private media where it belongs, and contact sharing only when you choose.
          </p>
          <div className="home-hero-actions">
            <Link href="/auth/register" className="button home-primary-action">
              Create account <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/auth/login" className="button secondary home-secondary-action">
              Sign in
            </Link>
          </div>
          <div className="home-hero-trustbar" aria-label="IllamHelp safety highlights">
            <span>Human identity first</span>
            <span>Privacy state visible</span>
            <span>Next safe action named</span>
          </div>
        </div>

        <div className="home-trust-scene home-trust-studio" aria-label="IllamHelp trust workflow preview">
          <div className="home-scene-status">
            <span className="home-live-dot" aria-hidden="true" />
            Safe next action: review Arun&apos;s profile
          </div>
          <div className="home-scene-topline">
            <span>Kochi, 8:40 AM</span>
            <span>Kitchen leak repair</span>
          </div>
          <div className="home-studio-board">
            <div className="home-person-card">
              <div className="home-person-avatar" aria-hidden="true">A</div>
              <div>
                <span className="home-card-label">Applicant</span>
                <strong>Arun M.</strong>
                <span>Plumber, Kakkanad</span>
              </div>
              <ShieldCheck size={22} aria-hidden="true" />
            </div>

            <div className="home-workflow-track" aria-hidden="true">
              <span className="active" />
              <span className="active" />
              <span />
            </div>

            <div className="home-job-card">
              <div className="home-job-icon">
                <BriefcaseBusiness size={24} aria-hidden="true" />
              </div>
              <div>
                <span className="home-card-label">Job</span>
                <strong>Urgent plumber needed</strong>
                <span>Kakkanad, today</span>
              </div>
            </div>

            <div className="home-media-proof-card">
              <div className="home-media-frame">
                <PlayCircle size={30} aria-hidden="true" />
                <span>Work sample video</span>
              </div>
              <div>
                <strong>Approved profile media</strong>
                <span>Visible to accepted connections only.</span>
              </div>
            </div>
          </div>

          <div className="home-proof-grid">
            <div className="home-proof-card strong">
              <ShieldCheck size={22} aria-hidden="true" />
              <strong>Identity reviewed</strong>
              <span>Real person context comes before action.</span>
            </div>
            <div className="home-proof-card">
              <LockKeyhole size={22} aria-hidden="true" />
              <strong>Privacy locked</strong>
              <span>Contact details stay hidden until approved.</span>
            </div>
            <div className="home-proof-card">
              <Sparkles size={22} aria-hidden="true" />
              <strong>Action is obvious</strong>
              <span>Review, accept, message, or wait.</span>
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
          <h2>Trust is not a badge here. It is the order of the page.</h2>
          <p>
            Every important surface starts with a human, shows the privacy state, and names the next action.
          </p>
        </div>
        <div className="home-proof-steps">
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Human identity</strong>
            <span>Provider, job owner, applicant, and connection context come before raw records.</span>
          </div>
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Privacy state</strong>
            <span>Profile media, job media, documents, and contact details each have visible rules.</span>
          </div>
          <div>
            <CheckCircle2 size={20} aria-hidden="true" />
            <strong>Next safe action</strong>
            <span>The interface says what to do next without forcing a risky step.</span>
          </div>
        </div>
      </section>
      <section className="section home-legal-band" aria-label="Legal and support links">
        <div className="container">
          <div className="legal-link-row">
            <Link href="/privacy-policy">Privacy Policy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/help">Help</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
