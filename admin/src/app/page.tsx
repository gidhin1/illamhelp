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

function formatQueuedDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

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
  const pendingItems = useMemo(
    () => queue.filter((item) => item.status === "pending").slice(0, 5),
    [queue]
  );
  const nextItem = pendingItems[0] ?? null;

  return (
    <div className="stack" style={{ gap: 0 }}>
      {/* Sticky Header */}
      <div className="top-header">
        <h1 className="display-title" style={{ fontSize: "1.5rem" }}>Operations Dashboard</h1>
        <div className="section-actions">
           <Link className="button secondary" href="/moderation">Go to Moderation</Link>
        </div>
      </div>

      <div className="admin-workbench-shell">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="stack" style={{ gap: "var(--spacing-2xl)" }}>
          <div className="admin-workbench-grid">
            <Card className="stack admin-workbench-primary">
              <div className="admin-workbench-header">
                <div>
                  <span className="pill">Next safe action</span>
                  <h2>Review the oldest pending media first.</h2>
                  <p className="muted-text">Work from the queue instead of chasing dashboard numbers.</p>
                </div>
                <Link className="button" href="/moderation">Open moderation queue</Link>
              </div>

              {nextItem ? (
                <div className="admin-next-review-card">
                  <div>
                    <div className="admin-next-title">{nextItem.kind} media awaiting review</div>
                    <div className="muted-text">Purpose: {nextItem.purpose.replaceAll("_", " ")}</div>
                    <div className="admin-review-id">Media ID: {nextItem.mediaId}</div>
                  </div>
                  <div className="admin-next-meta">
                    <span className="pill">{nextItem.mediaState.replaceAll("_", " ")}</span>
                    <span className="muted-text">Queued {formatQueuedDate(nextItem.moderationCreatedAt)}</span>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No pending media reviews"
                  body="Automated checks will add uploads here when they need a staff decision."
                />
              )}
            </Card>

            <Card className="stack admin-workbench-side">
              <h3>Queue health</h3>
              <div className="admin-queue-health">
                <div>
                  <strong>{kpis.total}</strong>
                  <span>Total items</span>
                </div>
                <div>
                  <strong>{kpis.pending}</strong>
                  <span>Pending</span>
                </div>
                <div>
                  <strong>{kpis.approved}</strong>
                  <span>Approved</span>
                </div>
                <div>
                  <strong>{kpis.rejected}</strong>
                  <span>Rejected</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid two" style={{ alignItems: "start" }} aria-label="Operations actions">
            <Card className="stack">
              <div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Pending review queue</h3>
                 <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                   {kpis.pending > 0 ? `${kpis.pending} item${kpis.pending === 1 ? "" : "s"} need a human decision.` : "No human media decisions are waiting right now."}
                 </p>
              </div>
              <div className="admin-pending-list">
                {pendingItems.map((item) => (
                  <div key={item.mediaId} className="admin-pending-item">
                    <strong>{item.kind} · {item.purpose.replaceAll("_", " ")}</strong>
                    <span className="muted-text">Queued {formatQueuedDate(item.moderationCreatedAt)}</span>
                  </div>
                ))}
              </div>
              <Link href="/moderation" className="button secondary" style={{ marginTop: 8, width: "100%" }}>Review pending media</Link>
            </Card>

            <Card className="stack">
              <div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Consent and audit search</h3>
              </div>
              <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                Look up a member to review privacy access, sharing approvals, and recorded actions.
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
