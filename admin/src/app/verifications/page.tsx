"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    Field,
    TextArea
} from "@/components/ui/primitives";
import {
    formatDate,
    listVerifications,
    reviewVerification,
    VerificationRecord
} from "@/lib/api";

const STATUS_OPTS = [
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All Records" }
];

export default function VerificationsPage(): React.JSX.Element {
    const { accessToken } = useSession();
    const [items, setItems] = useState<VerificationRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({});
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const loadVerifications = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        setError(null);
        try {
            const result = await listVerifications(
                { status: statusFilter || undefined, limit: 100 },
                accessToken
            );
            setItems(result.items);
            setTotal(result.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load verifications");
        } finally {
            setLoading(false);
        }
    }, [accessToken, statusFilter]);

    useEffect(() => {
        void loadVerifications();
    }, [loadVerifications]);

    const onReview = async (
        requestId: string,
        notes: string,
        decision: "approved" | "rejected"
    ): Promise<void> => {
        if (!accessToken) return;
        setActionLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const updated = await reviewVerification(
                requestId,
                { decision, notes: notes.trim() || undefined },
                accessToken
            );
            setItems((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
            );
            setReviewingId(null);
            setReviewNotesById((prev) => {
                const next = { ...prev };
                delete next[requestId];
                return next;
            });
            setSuccessMessage(`Verification ${updated.status} successfully.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to review verification");
        } finally {
            setActionLoading(false);
        }
    };

    const columns: ColumnDef<VerificationRecord>[] = [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = row.original.status;
          let color = "var(--ink)";
          if (s === "pending") color = "var(--warning)";
          if (s === "approved") color = "var(--success)";
          if (s === "rejected") color = "var(--danger)";
          return <span className="pill" style={{ color }}>{s.replaceAll("_", " ")}</span>;
        }
      },
      {
        accessorKey: "userId",
        header: "Member ID",
        cell: ({ row }) => <span style={{ fontWeight: 600, color: "var(--ink)", fontFamily: "monospace", fontSize: "0.9rem" }}>{row.original.userId}</span>
      },
      {
        accessorKey: "documentType",
        header: "KYC Type",
        cell: ({ row }) => <span style={{ textTransform: "capitalize" }}>{row.original.documentType.replaceAll("_", " ")}</span>
      },
      {
        accessorKey: "createdAt",
        header: "Submitted",
        cell: ({ row }) => <span className="muted-text">{formatDate(row.original.createdAt).split(",")[0]}</span>
      },
      {
        id: "actions",
        header: "Review",
        cell: ({ row }) => {
          const item = row.original;
          const isReviewing = reviewingId === item.id;
          const reviewNotes = reviewNotesById[item.id] ?? "";
          if (item.status === "approved" || item.status === "rejected") {
             return <Button variant="ghost" disabled style={{ padding: "4px 8px", fontSize: "0.8rem" }}>Completed</Button>;
          }
          if (!isReviewing) {
             return (
               <Button
                 data-testid={`verification-review-${item.id}`}
                 style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                 onClick={() => {
                     setReviewingId(item.id);
                     setReviewNotesById((prev) => ({ ...prev, [item.id]: prev[item.id] ?? "" }));
                 }}
               >
                 Start Review
               </Button>
             );
          }
          return (
             <div className="stack" style={{ gap: "8px", minWidth: "220px", background: "var(--surface)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--brand)", position: "absolute", right: "20px", marginTop: "-10px", zIndex: 10, boxShadow: "var(--shadow)" }}>
                <Field label="Decision Notes (Audit)">
                   <TextArea
                     value={reviewNotes}
                     onChange={(e) => setReviewNotesById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                     placeholder="Rationale..."
                     style={{ minHeight: "60px", fontSize: "0.8rem", padding: "8px" }}
                   />
                </Field>
                <div style={{ display: "flex", gap: "8px" }}>
                   <Button data-testid={`verification-approve-${item.id}`} disabled={actionLoading} onClick={() => void onReview(item.id, reviewNotes, "approved")} style={{ flex: 1, padding: "4px", fontSize: "0.8rem" }}>
                     Approve
                   </Button>
                   <Button variant="secondary" data-testid={`verification-reject-${item.id}`} disabled={actionLoading} onClick={() => void onReview(item.id, reviewNotes, "rejected")} style={{ flex: 1, padding: "4px", fontSize: "0.8rem", color: "var(--danger)" }}>
                     Reject
                   </Button>
                </div>
                <Button variant="ghost" onClick={() => { setReviewingId(null); setReviewNotesById((prev) => { const next = { ...prev }; delete next[item.id]; return next; }); }} style={{ padding: "4px", fontSize: "0.8rem" }}>
                   Cancel
                </Button>
             </div>
          );
        }
      }
    ];

    return (
        <PageShell>
             <div className="stack" style={{ gap: 0 }}>
               <div className="top-header">
                 <div>
                    <div className="pill" style={{ marginBottom: "8px", background: "none", border: "none", padding: 0 }}>Trust & Safety</div>
                    <h2 className="display-title" style={{ fontSize: "1.5rem" }}>Verification Processing</h2>
                 </div>
                 <div className="section-actions" style={{ display: "flex", gap: "8px", background: "var(--surface)", padding: "4px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}>
                    {STATUS_OPTS.map((opt) => (
                        <button
                          key={opt.value}
                          style={{
                              padding: "6px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: "none",
                              background: statusFilter === opt.value ? "var(--surface-hover)" : "transparent",
                              color: statusFilter === opt.value ? "var(--ink)" : "var(--muted)",
                              fontWeight: statusFilter === opt.value ? 600 : 500,
                              fontSize: "0.85rem",
                              cursor: "pointer"
                          }}
                          onClick={() => setStatusFilter(opt.value)}
                        >
                          {opt.label}
                        </button>
                    ))}
                 </div>
               </div>

                <div style={{ padding: "var(--spacing-xl)" }}>
                    <RequireAdminSession>
                        <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {successMessage ? <Banner tone="success">{successMessage}</Banner> : null}

                            <Card className="stack" style={{ padding: 0, overflow: "hidden" }}>
                                <div style={{ padding: "var(--spacing-md)", borderBottom: "1px solid var(--line)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>Current Queue</h3>
                                  <span className="pill">{total} Total Requests</span>
                                </div>
                                {loading ? (
                                    <div style={{ padding: "var(--spacing-xl)", textAlign: "center" }}><p className="muted-text">Loading...</p></div>
                                ) : items.length === 0 ? (
                                    <div style={{ padding: "var(--spacing-xl)" }}>
                                      <EmptyState
                                          title="No verification requests"
                                          body="No requests match the current queue parameters."
                                      />
                                    </div>
                                ) : (
                                    <div style={{ position: "relative" }}>
                                      <DataTable columns={columns} data={items} />
                                    </div>
                                )}
                            </Card>
                        </div>
                    </RequireAdminSession>
                </div>
            </div>
        </PageShell>
    );
}
