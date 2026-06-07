"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    Card,
    EmptyState,
    Field,
    SelectInput,
    TextArea,
    TextInput
} from "@/components/ui/primitives";
import {
    formatDate,
    getModerationDetails,
    listVerifications,
    ModerationDetails,
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

type VerificationSortOrder = "oldest" | "newest";

function shortId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function statusLabel(status: VerificationRecord["status"]): string {
    return status.replaceAll("_", " ");
}

function statusColor(status: VerificationRecord["status"]): string {
    if (status === "pending") return "var(--warning-text)";
    if (status === "approved") return "var(--success-text)";
    if (status === "rejected") return "var(--error-text)";
    return "var(--ink)";
}

function documentTypeLabel(documentType: string): string {
    return documentType.replaceAll("_", " ");
}

export default function VerificationsPage(): React.JSX.Element {
    const { accessToken } = useSession();
    const [items, setItems] = useState<VerificationRecord[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [queueSearch, setQueueSearch] = useState("");
    const [queueSortOrder, setQueueSortOrder] = useState<VerificationSortOrder>("oldest");
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({});
    const [previewByMediaId, setPreviewByMediaId] = useState<Record<string, ModerationDetails>>({});
    const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
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
            setNextCursor(result.nextCursor);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load verifications");
        } finally {
            setLoading(false);
        }
    }, [accessToken, statusFilter]);

    const loadMoreVerifications = async (): Promise<void> => {
        if (!accessToken || !nextCursor) return;
        setLoading(true);
        setError(null);
        try {
            const result = await listVerifications(
                { status: statusFilter || undefined, limit: 100, cursor: nextCursor },
                accessToken
            );
            setItems((previous) => [...previous, ...result.items]);
            setNextCursor(result.nextCursor);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load more verifications");
        } finally {
            setLoading(false);
        }
    };

    const onPreviewDocument = async (mediaId: string): Promise<void> => {
        if (!accessToken) return;
        if (previewByMediaId[mediaId]) {
            return;
        }
        setPreviewLoadingId(mediaId);
        setError(null);
        try {
            const details = await getModerationDetails(mediaId, accessToken);
            setPreviewByMediaId((previous) => ({ ...previous, [mediaId]: details }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load document preview");
        } finally {
            setPreviewLoadingId(null);
        }
    };

    useEffect(() => {
        void loadVerifications();
    }, [loadVerifications]);

    useEffect(() => {
        if (items.length === 0) {
            setReviewingId(null);
            return;
        }
        if (!reviewingId || !items.some((item) => item.id === reviewingId)) {
            setReviewingId(items[0].id);
        }
    }, [items, reviewingId]);

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
            setReviewingId(updated.id);
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

    const selectedRequest = useMemo(
        () => items.find((item) => item.id === reviewingId) ?? null,
        [items, reviewingId]
    );
    const visibleItems = useMemo(() => {
        const query = queueSearch.trim().toLowerCase();
        return items
            .filter((item) => {
                if (!query) return true;
                return [
                    item.userId,
                    item.id,
                    item.status,
                    item.documentType,
                    item.documentMediaIds.join(" ")
                ].some((value) => value.toLowerCase().includes(query));
            })
            .sort((a, b) => {
                const left = new Date(a.createdAt).getTime();
                const right = new Date(b.createdAt).getTime();
                return queueSortOrder === "oldest" ? left - right : right - left;
            });
    }, [items, queueSearch, queueSortOrder]);
    const visibleGroups = useMemo(() => {
        const statuses: VerificationRecord["status"][] = ["pending", "under_review", "approved", "rejected"];
        return statuses
            .map((status) => ({
                status,
                items: visibleItems.filter((item) => item.status === status)
            }))
            .filter((group) => group.items.length > 0);
    }, [visibleItems]);
    const selectedReviewNotes = selectedRequest ? reviewNotesById[selectedRequest.id] ?? "" : "";
    const selectedHasDocuments = (selectedRequest?.documentMediaIds.length ?? 0) > 0;
    const selectedIsComplete = selectedRequest?.status === "approved" || selectedRequest?.status === "rejected";
    const rejectionNotesTooShort = selectedReviewNotes.trim().length < 8;

    return (
        <PageShell>
          <RequireAdminSession>
             <div className="stack admin-review-page">
               <div className="admin-review-topbar">
                 <div className="admin-review-title-block">
                    <span className="admin-review-kicker">Trust & Safety</span>
                    <h1 className="display-title admin-review-title">Verification Processing</h1>
                 </div>
                 <div className="admin-review-segmented" role="group" aria-label="Verification status">
                    {STATUS_OPTS.map((opt) => (
                        <button
                          key={opt.value}
                          className={statusFilter === opt.value ? "active" : ""}
                          onClick={() => setStatusFilter(opt.value)}
                          aria-pressed={statusFilter === opt.value}
                        >
                          {opt.label}
                        </button>
                    ))}
                 </div>
               </div>

                <div className="admin-review-shell">
                        <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {successMessage ? <Banner tone="success">{successMessage}</Banner> : null}

                            <div className="verification-workspace admin-review-layout">
                                <Card className="verification-queue-panel admin-review-panel stack" style={{ padding: 0, overflow: "hidden" }}>
                                    <div className="verification-panel-header admin-review-panel-header">
                                      <h3>Current Queue</h3>
                                      <span className="pill">{visibleItems.length} Shown</span>
                                    </div>
                                    <div className="admin-review-queue-tools">
                                      <Field label="Find applicant">
                                        <TextInput
                                          data-testid="verification-queue-search"
                                          value={queueSearch}
                                          onChange={(event) => setQueueSearch(event.target.value)}
                                          placeholder="Member ID, request ID, status, document type"
                                        />
                                      </Field>
                                      <Field label="Order">
                                        <SelectInput
                                          data-testid="verification-sort-order"
                                          value={queueSortOrder}
                                          onChange={(event) => setQueueSortOrder(event.target.value as VerificationSortOrder)}
                                        >
                                          <option value="oldest">Oldest first</option>
                                          <option value="newest">Newest first</option>
                                        </SelectInput>
                                      </Field>
                                    </div>
                                    {loading ? (
                                        <div style={{ padding: "var(--spacing-xl)", textAlign: "center" }}><p className="muted-text">Loading verification requests...</p></div>
                                    ) : visibleItems.length === 0 ? (
                                        <div style={{ padding: "var(--spacing-xl)" }}>
                                          <EmptyState
                                              title="No verification requests"
                                              body="No requests match the current queue parameters. Clear search or choose another status."
                                          />
                                        </div>
                                    ) : (
                                        <div className="verification-queue-list" role="list" aria-label="Verification requests">
                                          {visibleGroups.map((group) => (
                                            <div key={group.status} className="admin-review-list-group" role="group" aria-label={statusLabel(group.status)}>
                                              <div className="admin-review-group-label">{statusLabel(group.status)} · {group.items.length}</div>
                                              {group.items.map((item) => {
                                                const selected = selectedRequest?.id === item.id;
                                                const complete = item.status === "approved" || item.status === "rejected";
                                                return (
                                                  <button
                                                    key={item.id}
                                                    type="button"
                                                    className={`verification-queue-item ${selected ? "selected" : ""}`}
                                                    aria-pressed={selected}
                                                    data-testid={`verification-review-${item.id}`}
                                                    onClick={() => {
                                                        setReviewingId(item.id);
                                                        setReviewNotesById((prev) => ({ ...prev, [item.id]: prev[item.id] ?? "" }));
                                                    }}
                                                  >
                                                    <span className="verification-queue-row">
                                                      <strong>Member {shortId(item.userId)}</strong>
                                                      <span className="pill" style={{ color: statusColor(item.status) }}>{statusLabel(item.status)}</span>
                                                    </span>
                                                    <span className="verification-queue-id">Member ID: {item.userId}</span>
                                                    <span className="verification-queue-id">Request ID: {shortId(item.id)}</span>
                                                    <span className="muted-text">Private verification · {item.documentMediaIds.length} document{item.documentMediaIds.length === 1 ? "" : "s"}</span>
                                                    <span className="muted-text">{complete ? "Review decision history" : "Preview documents, then approve or reject"} · submitted {formatDate(item.createdAt).split(",")[0]}</span>
                                                    {complete ? <span className="verification-completed-label">Decision recorded</span> : null}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          ))}
                                          {nextCursor ? (
                                            <div style={{ padding: "var(--spacing-md)", display: "flex", justifyContent: "center" }}>
                                              <Button variant="secondary" disabled={loading} onClick={() => void loadMoreVerifications()}>
                                                {loading ? "Loading..." : "Load more requests"}
                                              </Button>
                                            </div>
                                          ) : null}
                                        </div>
                                    )}
                                </Card>

                                <Card className="verification-review-panel admin-review-panel admin-review-detail-panel stack" data-testid="verification-review-panel">
                                  {selectedRequest ? (
                                    <>
                                      <div className="verification-review-header">
                                        <div>
                                          <div className="pill" style={{ color: statusColor(selectedRequest.status), marginBottom: "8px" }}>
                                            {statusLabel(selectedRequest.status)}
                                          </div>
                                          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Member {shortId(selectedRequest.userId)}</h3>
                                        </div>
                                        {selectedIsComplete ? <span className="verification-completed-label">Completed</span> : null}
                                      </div>

                                      <div className="verification-facts" aria-label="Verification request details">
                                        <div>
                                          <span className="muted-text">Applicant</span>
                                          <strong>Member {shortId(selectedRequest.userId)}</strong>
                                          <span className="verification-queue-id">Member ID: {selectedRequest.userId}</span>
                                        </div>
                                        <div>
                                          <span className="muted-text">Privacy state</span>
                                          <strong>Private verification</strong>
                                          <span>{selectedRequest.documentMediaIds.length} document{selectedRequest.documentMediaIds.length === 1 ? "" : "s"}</span>
                                        </div>
                                        <div>
                                          <span className="muted-text">Next safe action</span>
                                          <strong>{selectedIsComplete ? "Review decision history" : "Preview, then decide"}</strong>
                                          <span>{documentTypeLabel(selectedRequest.documentType)}</span>
                                        </div>
                                        <div>
                                          <span className="muted-text">Submitted</span>
                                          <strong>{formatDate(selectedRequest.createdAt)}</strong>
                                        </div>
                                        {selectedRequest.reviewedAt ? (
                                          <div>
                                            <span className="muted-text">Reviewed</span>
                                            <strong>{formatDate(selectedRequest.reviewedAt)}</strong>
                                          </div>
                                        ) : null}
                                      </div>

                                      {selectedRequest.notes ? (
                                        <Banner tone="info">{selectedRequest.notes}</Banner>
                                      ) : null}

                                      <div className="stack">
                                        <div>
                                          <h4>Private documents</h4>
                                          <p className="muted-text">Document previews are fetched only for this selected verification request.</p>
                                        </div>
                                        {selectedRequest.documentMediaIds.length === 0 ? (
                                          <Banner tone="error">No private documents are attached to this verification request.</Banner>
                                        ) : (
                                          <div className="verification-evidence-grid">
                                            {selectedRequest.documentMediaIds.map((mediaId) => {
                                              const details = previewByMediaId[mediaId];
                                              return (
                                                <div key={mediaId} className="verification-document-preview">
                                                  <div className="muted-text" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>Private document ID: {mediaId}</div>
                                                  {details ? (
                                                    <div data-testid={`verification-document-preview-${mediaId}`}>
                                                      {details.media.kind === "image" ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={details.media.previewUrl} alt="Private verification document preview" />
                                                      ) : (
                                                        <video controls preload="metadata">
                                                          <source src={details.media.previewUrl} type={details.media.contentType} />
                                                        </video>
                                                      )}
                                                    </div>
                                                  ) : null}
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    disabled={previewLoadingId === mediaId}
                                                    onClick={() => void onPreviewDocument(mediaId)}
                                                  >
                                                    {previewLoadingId === mediaId ? "Loading..." : details ? "Preview loaded" : "Preview document"}
                                                  </Button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <div className="verification-checklist" aria-label="Verification review safeguards">
                                        <span>Private document purpose only</span>
                                        <span>Document preview opened in review context</span>
                                        <span>Rejected requests require decision notes</span>
                                      </div>

                                      <Field
                                        label="Decision notes"
                                        hint={selectedIsComplete ? "This request already has a recorded decision." : "Required for rejection. Keep it specific enough for audit and applicant support."}
                                      >
                                        <TextArea
                                          value={selectedReviewNotes}
                                          disabled={selectedIsComplete || actionLoading}
                                          onChange={(e) => setReviewNotesById((prev) => ({ ...prev, [selectedRequest.id]: e.target.value }))}
                                          placeholder="Decision rationale..."
                                          style={{ minHeight: "110px" }}
                                        />
                                      </Field>

                                      {selectedRequest.reviewerNotes ? (
                                        <Banner tone="info">Recorded review note: {selectedRequest.reviewerNotes}</Banner>
                                      ) : null}

                                      <div className="verification-decision-actions">
                                        <Button
                                          data-testid={`verification-approve-${selectedRequest.id}`}
                                          disabled={actionLoading || selectedIsComplete || !selectedHasDocuments}
                                          onClick={() => void onReview(selectedRequest.id, selectedReviewNotes, "approved")}
                                        >
                                          {actionLoading ? "Saving..." : "Approve verification"}
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          data-testid={`verification-reject-${selectedRequest.id}`}
                                          disabled={actionLoading || selectedIsComplete || !selectedHasDocuments || rejectionNotesTooShort}
                                          onClick={() => void onReview(selectedRequest.id, selectedReviewNotes, "rejected")}
                                          style={{ color: "var(--error-text)" }}
                                        >
                                          Reject verification
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          disabled={selectedIsComplete || selectedReviewNotes.length === 0}
                                          onClick={() => {
                                            if (!selectedRequest) return;
                                            setReviewNotesById((prev) => {
                                              const next = { ...prev };
                                              delete next[selectedRequest.id];
                                              return next;
                                            });
                                          }}
                                        >
                                          Clear notes
                                        </Button>
                                      </div>
                                      {!selectedHasDocuments ? <p className="field-error">A request without private documents cannot be approved or rejected from this screen.</p> : null}
                                      {!selectedIsComplete && rejectionNotesTooShort ? <p className="field-hint">Add at least 8 characters before rejecting this request.</p> : null}
                                    </>
                                  ) : (
                                    <EmptyState
                                      title="Select a verification request"
                                      body="Choose a request from the queue to review private documents and record a decision."
                                    />
                                  )}
                                </Card>
                            </div>
                        </div>
                </div>
            </div>
          </RequireAdminSession>
        </PageShell>
    );
}
