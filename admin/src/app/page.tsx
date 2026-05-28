"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Card,
  EmptyState,
} from "@/components/ui/primitives";
import {
  ModerationQueueItem,
  listModerationQueue
} from "@/lib/api";

function DashboardContent(): React.JSX.Element {
  const { accessToken } = useSession();
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    void (async () => {
      try {
        const items = await listModerationQueue(accessToken, { limit: 100 });
        if (!cancelled) {
          setQueue(items);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setQueue([]);
          setError(requestError instanceof Error ? requestError.message : "Failed to load moderation queue");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const kpis = useMemo(() => {
    const pending = queue.filter((item) => item.status === "pending").length;
    const rejected = queue.filter((item) => item.status === "rejected").length;
    const approved = queue.filter((item) => item.status === "approved").length;
    return { pending, rejected, approved, total: queue.length };
  }, [queue]);

  return (
    <div className="stack" style={{ gap: 0 }}>
      {/* Sticky Header */}
      <div className="top-header">
        <h1 className="display-title" style={{ fontSize: "1.5rem" }}>Operations Dashboard</h1>
        <div className="section-actions">
           <Link className="button secondary" href="/moderation">Go to Moderation</Link>
        </div>
      </div>

      <div style={{ padding: "var(--spacing-xl)" }}>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="stack" style={{ gap: "var(--spacing-2xl)" }}>
          {/* KPI Section */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Content Review Summary</h3>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Queue Size</div>
                <div className="kpi-value">{kpis.total}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Pending Review</div>
                <div className="kpi-value" style={{ color: kpis.pending > 0 ? "var(--warning-text)" : "var(--ink)" }}>{kpis.pending}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Approved</div>
                <div className="kpi-value" style={{ color: "var(--success-text)" }}>{kpis.approved}</div>
              </div>
               <div className="kpi">
                <div className="kpi-label">Rejected</div>
                <div className="kpi-value" style={{ color: "var(--danger)" }}>{kpis.rejected}</div>
              </div>
            </div>
          </div>

          <div className="grid two" style={{ alignItems: "start" }} aria-label="Operations actions">
            <Card className="stack">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                 <div style={{ background: "var(--brand-2)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>1</div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Content decisions</h3>
              </div>
              <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                {kpis.pending > 0 ? `${kpis.pending} item${kpis.pending === 1 ? "" : "s"} awaiting a review decision.` : "There are no media decisions waiting right now."}
              </p>
              <Link href="/moderation" className="button secondary" style={{ marginTop: 8, width: "100%" }}>Open queue</Link>
            </Card>

            <Card className="stack">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                 <div style={{ background: "var(--brand-2)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>2</div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Consent and audit search</h3>
              </div>
              <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                Look up a member to review privacy access, grants, and recorded actions.
              </p>
              <Link href="/audit" className="button secondary" style={{ marginTop: 8, width: "100%" }}>Search timeline</Link>
            </Card>
          </div>

          {queue.length === 0 && !error ? (
            <EmptyState
              title="All caught up"
              body="The moderation queue is currently empty. New uploads will appear here after automated technical rules processing."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function HomePage(): React.JSX.Element {
  return (
    <PageShell>
      <RequireAdminSession>
        <DashboardContent />
      </RequireAdminSession>
    </PageShell>
  );
}
