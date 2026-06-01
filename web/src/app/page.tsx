"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";

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
        <div className="section-header" style={{ position: "sticky", top: 0, background: "var(--bg)", zIndex: 10 }}>
          <div>
            <h1 style={{ fontSize: "var(--font-xl)" }}>Your next steps</h1>
            <p className="muted-text" style={{ marginTop: 4 }}>Jobs, people, and sharing updates that need attention.</p>
          </div>
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
            <div className="feed-card" style={{ display: "flex", gap: "var(--spacing-md)", overflowX: "auto", paddingBottom: "var(--spacing-md)" }}>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)" }}>Jobs</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.totalJobs ?? 0}</div>
               </div>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)" }}>Connections</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.totalConnections ?? 0}</div>
               </div>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)" }}>Pending requests</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.pendingConnections ?? 0}</div>
               </div>
            </div>

            {dashboard?.recentJobs && dashboard.recentJobs.length > 0 ? (
              dashboard.recentJobs.map(job => (
                <div key={job.id} className="feed-card">
                  <div style={{ display: "flex", gap: "var(--spacing-lg)" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--brand)" }}>
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
      <div className="mobile-only" style={{ minHeight: "calc(100vh - 140px)", padding: "var(--spacing-2xl) var(--spacing-xl) calc(96px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "var(--spacing-2xl)" }}>
        <div className="stack" style={{ gap: "var(--spacing-xl)" }}>
          <div style={{ width: 58, height: 58, borderRadius: 18, border: "1px solid var(--line)", background: "var(--surface)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "var(--brand)" }}>
            I
          </div>
          <div className="stack" style={{ gap: "var(--spacing-md)" }}>
            <h1 className="display-title" style={{ fontSize: "var(--font-3xl)", lineHeight: 1.15 }}>
              Trusted help at home
            </h1>
            <p className="muted-text" style={{ fontSize: "1.05rem", lineHeight: 1.7 }}>
              Find service providers, manage jobs, and share contact details only when you choose.
            </p>
          </div>
        </div>

        <div className="stack" style={{ gap: "var(--spacing-md)" }}>
          <Link href="/auth/register" className="button" style={{ width: "100%", justifyContent: "center", fontSize: "1.05rem", padding: "16px 20px" }}>
            Create account
          </Link>
          <Link href="/auth/login" className="button secondary" style={{ width: "100%", justifyContent: "center", fontSize: "1.05rem", padding: "16px 20px" }}>
            Sign in
          </Link>
          <p className="muted-text" style={{ fontSize: "var(--font-xs)", lineHeight: 1.6 }}>
            Contact details stay private until you explicitly approve sharing.
          </p>
        </div>
      </div>

      <div className="desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "80vh", justifyContent: "center", padding: "var(--spacing-xl)" }}>
        <div style={{ maxWidth: 600 }}>
          <h1 className="display-title" style={{ fontSize: "var(--font-3xl)", marginBottom: "var(--spacing-md)", lineHeight: 1.2 }}>
            Find trusted help for your home.
          </h1>
          <p className="muted-text" style={{ fontSize: "1.15rem", marginBottom: "var(--spacing-xl)", lineHeight: 1.7, maxWidth: "42ch" }}>
            Discover skilled people for everyday home services, connect safely,
            and share contact details only when you choose.
          </p>
          <div style={{ display: "flex", gap: "var(--spacing-md)", flexWrap: "wrap" }}>
            <Link href="/auth/register" className="button" style={{ fontSize: "1.05rem", padding: "14px 28px" }}>
              Join now
            </Link>
            <Link href="/auth/login" className="button secondary" style={{ fontSize: "1.05rem", padding: "14px 28px" }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
