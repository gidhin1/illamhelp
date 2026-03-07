"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    Field,
    SectionHeader,
    TextArea
} from "@/components/ui/primitives";
import {
    formatDate,
    listVerifications,
    reviewVerification,
    VerificationRecord
} from "@/lib/api";

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
    pending: { label: "⏳ Pending", color: "#f59e0b" },
    under_review: { label: "🔍 Under review", color: "#3b82f6" },
    approved: { label: "✅ Approved", color: "#10b981" },
    rejected: { label: "❌ Rejected", color: "#ef4444" }
};

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
                { status: statusFilter || undefined, limit: 50 },
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
            setSuccessMessage(
                `Verification ${decision === "approved" ? "approved ✅" : "rejected ❌"} successfully.`
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to review verification");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <PageShell>
            <section className="section">
                <div className="container stack">
                    <SectionHeader
                        eyebrow="Admin"
                        title="Verification queue"
                        subtitle="Review provider identity verification requests."
                    />
                    <RequireAdminSession>
                        <div className="stack">
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {successMessage ? <Banner tone="success">{successMessage}</Banner> : null}

                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {["pending", "under_review", "approved", "rejected", ""].map(
                                    (status) => (
                                        <Button
                                            key={status || "all"}
                                            variant={statusFilter === status ? "primary" : "ghost"}
                                            onClick={() => setStatusFilter(status)}
                                        >
                                            {status
                                                ? STATUS_STYLES[status]?.label ?? status
                                                : "All"}
                                        </Button>
                                    )
                                )}
                                <span className="pill" style={{ padding: "6px 12px", marginLeft: "auto" }}>
                                    {total} total
                                </span>
                                <Button variant="ghost" onClick={() => void loadVerifications()}>
                                    Refresh
                                </Button>
                            </div>

                            {loading ? (
                                <p className="muted-text">Loading verifications...</p>
                            ) : items.length === 0 ? (
                                <EmptyState
                                    title="No verification requests"
                                    body="No requests match the current filter."
                                />
                            ) : (
                                <div className="stack">
                                    {items.map((item) => {
                                        const statusInfo = STATUS_STYLES[item.status];
                                        const isReviewing = reviewingId === item.id;
                                        const canReview =
                                            item.status === "pending" || item.status === "under_review";
                                        const reviewNotes = reviewNotesById[item.id] ?? "";

                                        return (
                                            <Card
                                                key={item.id}
                                                className="stack"
                                                data-testid={`verification-card-${item.id}`}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                                        <span
                                                            className="pill"
                                                            style={{
                                                                padding: "4px 10px",
                                                                borderColor: statusInfo?.color
                                                            }}
                                                        >
                                                            {statusInfo?.label ?? item.status}
                                                        </span>
                                                        <span className="field-hint">
                                                            {formatDate(item.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid two">
                                                    <div className="data-row">
                                                        <div className="data-title">User ID</div>
                                                        <div className="data-meta"
                                                            style={{ fontSize: "0.8rem", fontFamily: "monospace" }}
                                                        >
                                                            {item.userId}
                                                        </div>
                                                    </div>
                                                    <div className="data-row">
                                                        <div className="data-title">Document type</div>
                                                        <div className="data-meta">
                                                            {item.documentType.replaceAll("_", " ")}
                                                        </div>
                                                    </div>
                                                    <div className="data-row">
                                                        <div className="data-title">Documents</div>
                                                        <div className="data-meta">
                                                            {item.documentMediaIds.length} file(s)
                                                        </div>
                                                    </div>
                                                    {item.notes ? (
                                                        <div className="data-row">
                                                            <div className="data-title">Provider notes</div>
                                                            <div className="data-meta">{item.notes}</div>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {item.reviewerNotes ? (
                                                    <div className="data-row">
                                                        <div className="data-title">Reviewer notes</div>
                                                        <div className="data-meta">{item.reviewerNotes}</div>
                                                    </div>
                                                ) : null}

                                                {canReview ? (
                                                    isReviewing ? (
                                                        <div className="stack" style={{ gap: "8px" }}>
                                                            <Field label="Review notes (optional)">
                                                                <TextArea
                                                                    value={reviewNotes}
                                                                    onChange={(e) =>
                                                                        setReviewNotesById((prev) => ({
                                                                            ...prev,
                                                                            [item.id]: e.target.value
                                                                        }))
                                                                    }
                                                                    placeholder="Reason for approval or rejection..."
                                                                />
                                                            </Field>
                                                            <div style={{ display: "flex", gap: "8px" }}>
                                                                <Button
                                                                    data-testid={`verification-approve-${item.id}`}
                                                                    disabled={actionLoading}
                                                                    onClick={() =>
                                                                        void onReview(item.id, reviewNotes, "approved")
                                                                    }
                                                                >
                                                                    {actionLoading ? "Processing..." : "✅ Approve"}
                                                                </Button>
                                                                <Button
                                                                    data-testid={`verification-reject-${item.id}`}
                                                                    variant="secondary"
                                                                    disabled={actionLoading}
                                                                    onClick={() =>
                                                                        void onReview(item.id, reviewNotes, "rejected")
                                                                    }
                                                                >
                                                                    {actionLoading ? "Processing..." : "❌ Reject"}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setReviewingId(null);
                                                                        setReviewNotesById((prev) => {
                                                                            const next = { ...prev };
                                                                            delete next[item.id];
                                                                            return next;
                                                                        });
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            data-testid={`verification-review-${item.id}`}
                                                            variant="secondary"
                                                            onClick={() => {
                                                                setReviewingId(item.id);
                                                                setReviewNotesById((prev) => ({
                                                                    ...prev,
                                                                    [item.id]: prev[item.id] ?? ""
                                                                }));
                                                            }}
                                                        >
                                                            Review
                                                        </Button>
                                                    )
                                                ) : null}
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </RequireAdminSession>
                </div>
            </section>
        </PageShell>
    );
}
