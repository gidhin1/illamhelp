"use client";

import { formatUiError } from "@illamhelp/shared-types";

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
          setError(formatUiError(requestError, "Couldn’t load uploads. Refresh the queue to try again."));
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
        <h1 className="display-title" style={{ fontSize: "1.5rem" }}>Review work</h1>
        <div className="section-actions">
           <Link className="button secondary" href="/moderation">Review uploads</Link>
        </div>
      </div>

      <div className="admin-workbench-shell">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="stack" style={{ gap: "var(--spacing-2xl)" }}>
          <div className="admin-workbench-grid">
            <Card variant="review" className="stack admin-workbench-primary">
              <div className="admin-workbench-header">
                <div>
                  <span className="pill">Uploads to review</span>
                  <h2>Review the oldest uploads first.</h2>
                  <p className="muted-text">Open the queue to review uploads and record decisions.</p>
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
                  body="Uploads appear here when automated checks send them for review."
                />
              )}
            </Card>

            <Card variant="summary" className="stack admin-workbench-side">
              <h3>Media queue</h3>
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
              <div><Link href="/moderation" className="button ghost">View media queue</Link></div>
              <div><Link href="/verifications" className="button ghost">Review verification requests</Link></div>
            </Card>
          </div>

          <div className="grid two" style={{ alignItems: "start" }} aria-label="Operations actions">
            <Card variant="action" className="stack">
              <div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Pending review queue</h3>
                 <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                   {kpis.pending > 0 ? `${kpis.pending} item${kpis.pending === 1 ? "" : "s"} need a human decision.` : "No uploads are waiting for a staff decision."}
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

            <Card variant="action" className="stack">
              <div>
                 <h3 style={{ fontFamily: "var(--font-display)" }}>Search contact sharing and account activity</h3>
              </div>
              <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                Search by member ID to review contact sharing and account activity.
              </p>
              <Link href="/audit" className="button secondary" style={{ marginTop: 8, width: "100%" }}>Search member activity</Link>
            </Card>
          </div>

          {queue.length === 0 && !error ? (
            <EmptyState
              title="No uploads to review"
              body="Uploads appear here after automated checks."
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
