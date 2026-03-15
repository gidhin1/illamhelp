"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { MemberAvatar } from "@/components/MemberAvatar";
import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/primitives";
import {
  discoverConnections,
  getMyDashboard,
  DashboardResponse,
  formatDate,
  type ConnectionSearchCandidate
} from "@/lib/api";

export default function HomePage(): JSX.Element {
  const { user, loading, accessToken } = useSession();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [discoverPeople, setDiscoverPeople] = useState<ConnectionSearchCandidate[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const loadDash = async () => {
      setDashLoading(true);
      try {
        const [res, discover] = await Promise.all([
          getMyDashboard(accessToken),
          discoverConnections(accessToken, { limit: 4 }).catch(() => [])
        ]);
        if (!cancelled) {
          setDashboard(res);
          setDiscoverPeople(discover);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setDashLoading(false);
      }
    };
    void loadDash();
    return () => { cancelled = true; };
  }, [accessToken]);

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: "var(--spacing-xl)" }}>Loading...</div>
      </PageShell>
    );
  }

  if (user) {
    return (
      <PageShell>
        <div className="section-header" style={{ position: "sticky", top: 0, background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
          <h2 style={{ fontSize: "1.5rem" }}>For You</h2>
        </div>
        
        {dashLoading ? (
          <div style={{ padding: "var(--spacing-xl)", textAlign: "center" }} aria-live="polite">Loading feed...</div>
        ) : (
          <div className="stack" style={{ gap: 0 }}>
            {/* Quick Stats Pinned to feed top for mobile context */}
            <div className="feed-card" style={{ display: "flex", gap: "var(--spacing-md)", overflowX: "auto", paddingBottom: "var(--spacing-md)" }}>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Jobs</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.totalJobs ?? 0}</div>
               </div>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Connections</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.totalConnections ?? 0}</div>
               </div>
               <div className="card soft" style={{ flex: "0 0 auto", minWidth: 140, textAlign: "center" }}>
                 <div className="muted-text" style={{ fontSize: "var(--font-xs)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pending Req</div>
                 <div style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginTop: "4px" }}>{dashboard?.metrics.pendingConnections ?? 0}</div>
               </div>
            </div>

            {dashboard?.recentJobs && dashboard.recentJobs.length > 0 ? (
              dashboard.recentJobs.map((job) => (
                <div key={job.id} className="feed-card">
                  <div style={{ display: "flex", gap: "var(--spacing-lg)" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(145deg, var(--brand), var(--brand-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0, color: "white" }}>
                      💼
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--spacing-sm)" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>{job.title}</div>
                          <div className="muted-text" style={{ fontSize: "var(--font-sm)", marginTop: "2px" }}>{job.category} • {job.locationText}</div>
                        </div>
                        <span className="pill">{job.status}</span>
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
              <div style={{ padding: "var(--spacing-3xl) var(--spacing-xl)", textAlign: "center", color: "var(--muted)" }}>
                <p style={{ fontSize: "var(--font-md)" }}>No recent jobs in your feed.</p>
                <div style={{ marginTop: "var(--spacing-xl)" }}>
                  <Link href="/jobs" className="button-link">
                    <Button>Post a job</Button>
                  </Link>
                </div>
              </div>
            )}

            <div className="feed-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)" }}>Discover people</div>
                  <div className="muted-text">A temporary random list for now, ready to evolve into smarter recommendations later.</div>
                </div>
                <Link href="/connections" className="button-link">
                  <Button variant="secondary">Open People</Button>
                </Link>
              </div>
              {discoverPeople.length === 0 ? (
                <div className="muted-text" style={{ marginTop: "var(--spacing-md)" }}>
                  We’ll show nearby members here as soon as there are eligible people to suggest.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "var(--spacing-md)" }}>
                  {discoverPeople.map((person) => (
                    <div key={person.userId} className="card soft">
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <MemberAvatar name={person.displayName} avatar={person.avatar} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{person.displayName}</div>
                          <div className="muted-text" style={{ fontSize: "var(--font-sm)" }}>{person.locationLabel ?? "Location coming soon"}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "var(--spacing-md)" }}>
                        {(person.topSkills.length > 0 ? person.topSkills : ["Profile still adding services"]).map((skill) => (
                          <span key={skill} className="pill">{skill}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <span className="pill">IllamHelp mobile web</span>
            <h1 className="display-title" style={{ fontSize: "clamp(3rem, 14vw, 4.25rem)", letterSpacing: "-0.04em", lineHeight: 0.95 }}>
              Trusted help, beautifully organized.
            </h1>
            <p className="muted-text" style={{ fontSize: "1.05rem", lineHeight: 1.7 }}>
              Join a privacy-first home services network where jobs, people, and trust signals move in one clean flow.
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
          <span className="pill" style={{ marginBottom: "var(--spacing-md)" }}>Built for homes in Kerala and Tamil Nadu</span>
          <h1 className="display-title" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "var(--spacing-md)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
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
