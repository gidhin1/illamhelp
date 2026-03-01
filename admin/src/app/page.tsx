"use client";

import { useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Card,
  EmptyState,
  SectionHeader
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
    if (!accessToken) {
      return;
    }

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
    <section className="section">
      <div className="container stack">
        <SectionHeader
          eyebrow="Operations"
          title="Admin dashboard"
          subtitle="Track moderation workload and jump into member-level consent and audit history."
        />

        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="grid three">
          <Card className="stack" soft>
            <div className="data-title">Queue size</div>
            <div style={{ fontSize: "2rem", fontWeight: 700 }}>{kpis.total}</div>
            <div className="data-meta">Total moderation jobs in current queue view</div>
          </Card>
          <Card className="stack" soft>
            <div className="data-title">Pending review</div>
            <div style={{ fontSize: "2rem", fontWeight: 700 }}>{kpis.pending}</div>
            <div className="data-meta">Items waiting for manual decision</div>
          </Card>
          <Card className="stack" soft>
            <div className="data-title">Recent outcomes</div>
            <div className="data-meta">Approved: {kpis.approved}</div>
            <div className="data-meta">Rejected: {kpis.rejected}</div>
          </Card>
        </div>

        <div className="grid two">
          <Card className="stack">
            <h3>Moderation workflow</h3>
            <div className="data-row">
              <div className="data-title">1. Open queue</div>
              <div className="data-meta">Review pending assets and inspect context.</div>
            </div>
            <div className="data-row">
              <div className="data-title">2. Decide quickly</div>
              <div className="data-meta">Approve or reject with a policy reason code.</div>
            </div>
            <div className="data-row">
              <div className="data-title">3. Confirm audit trail</div>
              <div className="data-meta">Every action is recorded in the audit timeline.</div>
            </div>
          </Card>

          <Card className="stack">
            <h3>Consent and audit lookup</h3>
            <p className="muted-text">
              Search by member ID to review who requested access, what was granted, and all related audit events.
            </p>
            <p className="muted-text">
              Use this when handling disputes, privacy concerns, or compliance investigations.
            </p>
          </Card>
        </div>

        {queue.length === 0 && !error ? (
          <EmptyState
            title="No moderation items right now"
            body="The queue is currently empty. New uploads will appear here after technical and AI checks."
          />
        ) : null}
      </div>
    </section>
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
