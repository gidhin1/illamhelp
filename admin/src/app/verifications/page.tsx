"use client";

import { formatUiError } from "@illamhelp/shared-types";

import { ActionControl } from "@illamhelp/ui-web";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { BackToQueue, ReviewConfirmation, ReviewReceipt, useReviewWorkspace, type ReviewDecision } from "@/components/ui/ReviewWorkspace";
import { ReviewMediaPreview } from "@/components/ui/ReviewMediaPreview";
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
  { value: "", label: "All statuses" }
];

type VerificationSortOrder = "oldest" | "newest";

function shortId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function statusLabel(status: VerificationRecord["status"]): string {
    return STATUS_OPTS.find((option) => option.value === status)?.label ?? status;
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

function VerificationsContent(): React.JSX.Element {
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
    const [preview, setPreview] = useState<ModerationDetails | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const previewRequest = useRef(0);
    const queueRequest = useRef(0);
    const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [receipt, setReceipt] = useState<VerificationRecord | null>(null);
    const [decision, setDecision] = useState<ReviewDecision | null>(null);
    const [decisionError, setDecisionError] = useState<string | null>(null);
    const workspace = useReviewWorkspace("verification-queue-title", "verification-review-title");

    const loadVerifications = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        const request = ++queueRequest.current;
        setLoading(true);
        setError(null);
        try {
            const result = await listVerifications(
                { status: statusFilter || undefined, limit: 100 },
                accessToken
            );
            if (request !== queueRequest.current) return;
            setItems(result.items);
            setNextCursor(result.nextCursor);
        } catch (err) {
            if (request === queueRequest.current) {
                setItems([]);
                setNextCursor(null);
                setError(formatUiError(err, "Couldn’t load verification requests. Refresh the queue and try again."));
            }
        } finally {
            if (request === queueRequest.current) setLoading(false);
        }
    }, [accessToken, statusFilter]);

    const loadMoreVerifications = async (): Promise<void> => {
        if (!accessToken || !nextCursor) return;
        const request = ++queueRequest.current;
        setLoading(true);
        setError(null);
        try {
            const result = await listVerifications(
                { status: statusFilter || undefined, limit: 100, cursor: nextCursor },
                accessToken
            );
            if (request !== queueRequest.current) return;
            setItems((previous) => [...previous, ...result.items]);
            setNextCursor(result.nextCursor);
        } catch (err) {
            if (request === queueRequest.current) setError(formatUiError(err, "Couldn’t load more requests. Try again."));
        } finally {
            if (request === queueRequest.current) setLoading(false);
        }
    };

    function closePreview() {
        previewRequest.current++;
        setPreview(null);
        setPreviewError(null);
        setPreviewLoadingId(null);
    }

    const onPreviewDocument = async (mediaId: string): Promise<void> => {
        if (!accessToken) return;
        const request = ++previewRequest.current;
        setPreviewLoadingId(mediaId);
        setPreviewError(null);
        try {
            const details = await getModerationDetails(mediaId, accessToken);
            if (request === previewRequest.current) setPreview(details);
        } catch (err) {
            if (request === previewRequest.current) {
                setPreview(null);
                setPreviewError(formatUiError(err, "Couldn’t open this document. Select Preview document to try again."));
            }
        } finally {
            if (request === previewRequest.current) setPreviewLoadingId(null);
        }
    };

    useEffect(() => {
        void loadVerifications();
    }, [loadVerifications]);

    const onReview = async (
        requestId: string,
        notes: string,
        nextDecision: ReviewDecision
    ): Promise<void> => {
        if (!accessToken || actionLoading) return;
        setActionLoading(true);
        setDecisionError(null);
        try {
            const updated = await reviewVerification(
                requestId,
                { decision: nextDecision, notes: notes.trim() || undefined },
                accessToken
            );
            setReceipt(updated);
            setItems((previous) => previous.flatMap((item) =>
                item.id !== updated.id ? [item] : !statusFilter || updated.status === statusFilter ? [updated] : []
            ));
            setReviewNotesById((previous) => {
                const next = { ...previous };
                delete next[requestId];
                return next;
            });
            closePreview();
            setDecision(null);
        } catch (err) {
            setDecisionError(formatUiError(err, "Couldn’t save the decision. Try again or cancel and refresh the queue."));
        } finally {
            setActionLoading(false);
        }
    };

    const selectedRequest = receipt ?? items.find((item) => item.id === reviewingId) ?? null;
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

    function selectFilter(value: string) {
        if (value === statusFilter) return;
        setStatusFilter(value);
        setReviewingId(null);
        setReceipt(null);
        closePreview();
        workspace.close();
    }

    function backToQueue() {
        closePreview();
        if (receipt && !items.some((item) => item.id === receipt.id)) setReviewingId(null);
        setReceipt(null);
        workspace.close();
    }

    return (
             <div className="stack admin-review-page" data-review-open={workspace.open}>
               <div className="admin-review-topbar">
                 <div className="admin-review-title-block">
                    <h1 className="display-title admin-review-title">Review verification requests</h1>
                 </div>
                 <div className="admin-review-segmented review-queue-filters" role="group" aria-label="Verification status">
                    {STATUS_OPTS.map((opt) => (
                        <ActionControl
                          key={opt.value}
                          className={statusFilter === opt.value ? "active" : ""}
                          onClick={() => selectFilter(opt.value)}
                          aria-pressed={statusFilter === opt.value}
                        >
                          {opt.label}
                        </ActionControl>
                    ))}
                 </div>
               </div>

                <div className="admin-review-shell">
                        <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                            {error ? <Banner tone="error">{error}</Banner> : null}


                            <div className="admin-review-layout">
                                <Card variant="summary" className="verification-queue-panel admin-review-panel stack" style={{ padding: 0, overflow: "hidden" }}>
                                    <div className="verification-panel-header admin-review-panel-header">
                                      <div>
                                        <h2 id="verification-queue-title" tabIndex={-1}>Verification queue</h2>
                                        <p className="muted-text">{visibleItems.length} {visibleItems.length === 1 ? "request" : "requests"} shown</p>
                                      </div>
                                      <Button type="button" variant="ghost" disabled={loading} onClick={() => void loadVerifications()}>
                                        Refresh queue
                                      </Button>
                                    </div>
                                    <div className="admin-review-queue-tools">
                                      <Field label="Find applicant">
                                        <TextInput
                                          data-testid="verification-queue-search"
                                          value={queueSearch}
                                          onChange={(event) => setQueueSearch(event.target.value)}
                                          placeholder="Member or request ID, document type"
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
                                              body={queueSearch ? "Clear your search or choose another status." : "Choose another status or refresh the queue."}
                                          />
                                        </div>
                                    ) : (
                                        <div className="verification-queue-list" role="region" aria-label="Verification requests">
                                          {visibleGroups.map((group) => (
                                            <div key={group.status} className="admin-review-list-group" role="group" aria-label={statusLabel(group.status)}>
                                              <div className="admin-review-group-label">{statusLabel(group.status)} · {group.items.length}</div>
                                              {group.items.map((item) => {
                                                const selected = selectedRequest?.id === item.id;
                                                return (
                                                  <ActionControl
                                                    key={item.id}
                                                    type="button"
                                                    className={`verification-queue-item ${selected ? "selected" : ""}`}
                                                    aria-pressed={selected}
                                                    data-testid={`verification-review-${item.id}`}
                                                    onClick={(event) => {
                                                        if (reviewingId !== item.id || receipt) closePreview();
                                                        setReceipt(null);
                                                        setReviewingId(item.id);
                                                        workspace.show(event.currentTarget);
                                                    }}
                                                  >
                                                    <span className="verification-queue-row">
                                                      <strong>{documentTypeLabel(item.documentType)}</strong>
                                                      <span className="pill" style={{ color: statusColor(item.status) }}>{statusLabel(item.status)}</span>
                                                    </span>
                                                    <span className="verification-queue-id">Member ID: {item.userId}</span>
                                                    <span className="muted-text">{item.documentMediaIds.length} private {item.documentMediaIds.length === 1 ? "document" : "documents"} · {formatDate(item.createdAt).split(",")[0]}</span>
                                                  </ActionControl>
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

                                <Card as="section" id="verification-review" aria-labelledby="verification-review-title" variant="review" className="verification-review-panel admin-review-panel admin-review-detail-panel stack" data-testid="verification-review-panel">
                                  <BackToQueue onClick={backToQueue} />
                                  <div className="admin-review-detail-header">
                                    <h2 id="verification-review-title" tabIndex={-1}>{selectedRequest ? documentTypeLabel(selectedRequest.documentType) : "Verification details"}</h2>
                                    {selectedRequest ? <span className="pill" style={{ color: statusColor(selectedRequest.status) }}>{statusLabel(selectedRequest.status)}</span> : null}
                                  </div>
                                  {receipt ? <ReviewReceipt>Verification {receipt.status} successfully.</ReviewReceipt> : null}
                                  {selectedRequest ? (
                                    <>
                                      <div className="verification-facts" aria-label="Verification request details">
                                        <div>
                                          <span className="muted-text">Applicant</span>
                                          <strong>Member {shortId(selectedRequest.userId)}</strong>
                                          <span className="verification-queue-id">{selectedRequest.userId}</span>
                                        </div>
                                        <div>
                                          <span className="muted-text">Request</span>
                                          <strong>{formatDate(selectedRequest.createdAt)}</strong>
                                          <span className="verification-queue-id">{selectedRequest.id}</span>
                                        </div>
                                        {selectedRequest.reviewedAt ? (
                                          <div>
                                            <span className="muted-text">Reviewed</span>
                                            <strong>{formatDate(selectedRequest.reviewedAt)}</strong>
                                          </div>
                                        ) : null}
                                      </div>

                                      {selectedRequest.notes ? (
                                        <Banner tone="info"><strong>Applicant note</strong><br />{selectedRequest.notes}</Banner>
                                      ) : null}

                                      <div className="stack">
                                        <div>
                                          <h3>Private documents</h3>
                                          <p className="muted-text">Use these files only to review this request. They stay private after approval.</p>
                                        </div>
                                        {previewError ? <Banner tone="error">{previewError}</Banner> : null}
                                        {selectedRequest.documentMediaIds.length === 0 ? (
                                          <Banner tone="error">No private documents are attached to this verification request.</Banner>
                                        ) : (
                                          <div className="verification-evidence-grid">
                                            {selectedRequest.documentMediaIds.map((mediaId, index) => {
                                              const details = preview?.media.id === mediaId ? preview : null;
                                              return (
                                                <div key={mediaId} className="verification-document-preview">
                                                  <strong>Document {index + 1}</strong>
                                                  <span className="verification-queue-id">{mediaId}</span>
                                                  {details && previewLoadingId !== mediaId ? (
                                                    <div data-testid={`verification-document-preview-${mediaId}`}>
                                                      <ReviewMediaPreview media={details.media} alt="Private verification document preview" />
                                                    </div>
                                                  ) : null}
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    disabled={previewLoadingId !== null}
                                                    onClick={() => void onPreviewDocument(mediaId)}
                                                  >
                                                    {previewLoadingId === mediaId ? "Loading preview…" : details ? "Refresh preview" : "Preview document"}
                                                  </Button>
                                                  {details ? <Button type="button" variant="ghost" onClick={closePreview}>Close preview</Button> : null}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      {selectedIsComplete ? (
                                        <div className="admin-review-form stack">
                                          <h3>Recorded decision</h3>
                                          <p>{selectedRequest.reviewerNotes || "No decision note was recorded."}</p>
                                        </div>
                                      ) : (
                                        <div className="admin-review-form stack">
                                          <h3>Record a decision</h3>
                                          <Field label="Decision notes" hint="To reject, write at least 8 characters explaining what the applicant needs to fix. The applicant can read the note.">
                                            <TextArea
                                              value={selectedReviewNotes}
                                              disabled={actionLoading}
                                              onChange={(event) => setReviewNotesById((previous) => ({ ...previous, [selectedRequest.id]: event.target.value }))}
                                              placeholder="Add a decision note"
                                            />
                                          </Field>
                                          <div className="verification-decision-actions">
                                            <Button type="button" data-testid={`verification-approve-${selectedRequest.id}`} disabled={actionLoading || !selectedHasDocuments} onClick={() => { setDecisionError(null); setDecision("approved"); }}>
                                              Approve verification
                                            </Button>
                                            <Button type="button" variant="secondary" data-testid={`verification-reject-${selectedRequest.id}`} disabled={actionLoading || !selectedHasDocuments || rejectionNotesTooShort} onClick={() => { setDecisionError(null); setDecision("rejected"); }}>
                                              Reject verification
                                            </Button>
                                          </div>
                                          {!selectedHasDocuments ? <p className="field-error">A private document is required before you can record a decision.</p> : null}
                                        </div>
                                      )}
                                      {receipt ? <Button type="button" variant="secondary" className="review-receipt-back" onClick={backToQueue}>Return to queue</Button> : null}
                                      <ReviewConfirmation
                                        decision={decision}
                                        subject="verification"
                                        busy={actionLoading}
                                        onClose={() => setDecision(null)}
                                        onConfirm={() => { if (decision) void onReview(selectedRequest.id, selectedReviewNotes, decision); }}
                                      >
                                        <p>{decision === "rejected"
                                          ? "The applicant will see your reason and can submit a new request."
                                          : "This marks the member as verified. Their documents stay private."}</p>
                                        {selectedReviewNotes.trim() ? <p className="review-confirm-note">{selectedReviewNotes.trim()}</p> : null}
                                        {decisionError ? <Banner tone="error">{decisionError}</Banner> : null}
                                      </ReviewConfirmation>
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
    );
}

export default function VerificationsPage(): React.JSX.Element {
    return (
        <PageShell>
            <RequireAdminSession>
                <VerificationsContent />
            </RequireAdminSession>
        </PageShell>
    );
}
