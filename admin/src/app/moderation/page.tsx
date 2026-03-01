"use client";

import { useEffect, useMemo, useState } from "react";

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
  SelectInput,
  TextArea
} from "@/components/ui/primitives";
import {
  ModerationDetails,
  ModerationProcessResult,
  ModerationQueueItem,
  formatDate,
  getModerationDetails,
  listModerationQueue,
  processModerationQueue,
  reviewMedia
} from "@/lib/api";

const statusOptions = ["pending", "running", "approved", "rejected", "error"] as const;

function ModerationContent(): React.JSX.Element {
  const { accessToken } = useSession();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [details, setDetails] = useState<ModerationDetails | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [reasonCode, setReasonCode] = useState("policy_manual_review");
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [processingResult, setProcessingResult] = useState<ModerationProcessResult | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const queueSummary = useMemo(() => {
    return {
      total: queue.length,
      pending: queue.filter((item) => item.status === "pending").length,
      reviewed: queue.filter((item) => item.status === "approved" || item.status === "rejected").length
    };
  }, [queue]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingQueue(true);
      try {
        const items = await listModerationQueue(accessToken, {
          status: statusFilter,
          limit: 100
        });
        if (!cancelled) {
          setQueue(items);
          setBanner(null);
          if (items.length === 0) {
            setSelectedMediaId(null);
            setDetails(null);
          } else if (!selectedMediaId || !items.some((item) => item.mediaId === selectedMediaId)) {
            setSelectedMediaId(items[0].mediaId);
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setQueue([]);
          setDetails(null);
          setSelectedMediaId(null);
          setBanner({
            tone: "error",
            message: requestError instanceof Error ? requestError.message : "Failed to load moderation queue"
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingQueue(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedMediaId, statusFilter]);

  useEffect(() => {
    if (!accessToken || !selectedMediaId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingDetails(true);
      try {
        const result = await getModerationDetails(selectedMediaId, accessToken);
        if (!cancelled) {
          setDetails(result);
        }
      } catch (requestError) {
        if (!cancelled) {
          setDetails(null);
          setBanner({
            tone: "error",
            message: requestError instanceof Error ? requestError.message : "Failed to load moderation details"
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedMediaId]);

  async function refreshQueueAndDetails(activeMediaId: string | null): Promise<void> {
    if (!accessToken) {
      return;
    }

    const items = await listModerationQueue(accessToken, {
      status: statusFilter,
      limit: 100
    });
    setQueue(items);

    if (activeMediaId && items.some((item) => item.mediaId === activeMediaId)) {
      const refreshed = await getModerationDetails(activeMediaId, accessToken);
      setDetails(refreshed);
      setSelectedMediaId(activeMediaId);
      return;
    }

    if (items.length > 0) {
      setSelectedMediaId(items[0].mediaId);
      const refreshed = await getModerationDetails(items[0].mediaId, accessToken);
      setDetails(refreshed);
      return;
    }

    setSelectedMediaId(null);
    setDetails(null);
  }

  async function onProcessPending(): Promise<void> {
    if (!accessToken) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await processModerationQueue(accessToken, 20);
      setProcessingResult(result);
      await refreshQueueAndDetails(selectedMediaId);
      setBanner({
        tone: "success",
        message: `Processed ${result.processed} moderation jobs (${result.technicalApproved} technical approvals, ${result.technicalRejected} technical rejects, ${result.aiCompleted} AI decisions).`
      });
    } catch (requestError) {
      setBanner({
        tone: "error",
        message: requestError instanceof Error ? requestError.message : "Failed to process queue"
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onReview(decision: "approved" | "rejected"): Promise<void> {
    if (!accessToken || !selectedMediaId) {
      return;
    }

    setSubmitting(true);
    try {
      await reviewMedia(
        selectedMediaId,
        {
          decision,
          reasonCode,
          notes: notes.trim() || undefined
        },
        accessToken
      );
      await refreshQueueAndDetails(selectedMediaId);
      setNotes("");
      setBanner({
        tone: "success",
        message: decision === "approved" ? "Media approved." : "Media rejected."
      });
    } catch (requestError) {
      setBanner({
        tone: "error",
        message: requestError instanceof Error ? requestError.message : "Failed to submit review"
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section">
      <div className="container stack">
        <SectionHeader
          eyebrow="Admin"
          title="Moderation queue"
          subtitle="Review queued media items and take approval/rejection actions with policy reasons."
          actions={
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Field label="Status" hint="Queue filter">
                <SelectInput
                  data-testid="moderation-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Button
                type="button"
                variant="secondary"
                data-testid="moderation-process-pending"
                disabled={submitting}
                onClick={() => {
                  void onProcessPending();
                }}
              >
                Process pending machine checks
              </Button>
            </div>
          }
        />

        {banner ? <Banner tone={banner.tone}>{banner.message}</Banner> : null}
        {processingResult ? (
          <Banner tone="info">
            Selected: {processingResult.selected}, Processed: {processingResult.processed}, Errors: {processingResult.errors}
          </Banner>
        ) : null}

        <div className="grid two">
          <Card className="stack">
            <h3>Queue items</h3>
            <div className="muted-text">
              Total: {queueSummary.total} · Pending: {queueSummary.pending} · Reviewed: {queueSummary.reviewed}
            </div>
            {loadingQueue ? <Banner tone="info">Loading queue...</Banner> : null}
            {queue.length === 0 && !loadingQueue ? (
              <EmptyState
                title="No items found"
                body="Try another status filter or run machine checks to move items to review."
              />
            ) : null}
            <div className="stack">
              {queue.map((item) => {
                const active = item.mediaId === selectedMediaId;
                return (
                  <button
                    key={item.mediaId}
                    type="button"
                    data-testid={`moderation-item-${item.mediaId}`}
                    className="data-row"
                    style={{
                      textAlign: "left",
                      borderColor: active ? "rgba(81, 66, 177, 0.45)" : undefined,
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setSelectedMediaId(item.mediaId);
                    }}
                  >
                    <div className="data-title">
                      {item.kind.toUpperCase()} · {item.status}
                    </div>
                    <div className="data-meta">Current state: {item.mediaState}</div>
                    <div className="data-meta">Queued at: {formatDate(item.moderationCreatedAt)}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="stack" data-testid="moderation-details-panel">
            <h3>Selected item</h3>
            {loadingDetails ? <Banner tone="info">Loading details...</Banner> : null}
            {!loadingDetails && !details ? (
              <EmptyState
                title="Select an item"
                body="Choose a queue item to inspect AI scores and moderation history."
              />
            ) : null}
            {details ? (
              <>
                <div className="data-row" data-testid="moderation-media-summary">
                  <div className="data-title">{details.media.kind.toUpperCase()} media</div>
                  <div className="data-meta">Content type: {details.media.contentType}</div>
                  <div className="data-meta">Size: {details.media.fileSizeBytes} bytes</div>
                  <div className="data-meta">State: {details.media.state}</div>
                  <div className="data-meta">
                    Preview URL expires: {formatDate(details.media.previewUrlExpiresAt)}
                  </div>
                </div>

                <div className="data-row" data-testid="moderation-media-preview">
                  <div className="data-title">Preview</div>
                  {details.media.kind === "image" ? (
                    <img
                      data-testid="moderation-preview-image"
                      src={details.media.previewUrl}
                      alt={`Media preview ${details.media.id}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "320px",
                        borderRadius: "12px",
                        border: "1px solid rgba(27, 31, 36, 0.12)"
                      }}
                    />
                  ) : (
                    <video
                      data-testid="moderation-preview-video"
                      controls
                      preload="metadata"
                      style={{
                        width: "100%",
                        maxHeight: "360px",
                        borderRadius: "12px",
                        border: "1px solid rgba(27, 31, 36, 0.12)"
                      }}
                    >
                      <source src={details.media.previewUrl} type={details.media.contentType} />
                    </video>
                  )}
                </div>

                <div className="stack">
                  <h4>Moderation history</h4>
                  {details.moderationJobs.map((job) => (
                    <div key={job.id} className="data-row">
                      <div className="data-title">
                        {job.stage} · {job.status}
                      </div>
                      <div className="data-meta">Created: {formatDate(job.createdAt)}</div>
                      <div className="data-meta">Completed: {formatDate(job.completedAt)}</div>
                      {job.reasonCode ? <div className="data-meta">Reason: {job.reasonCode}</div> : null}
                    </div>
                  ))}
                </div>

                <Field label="Reason code" hint="Stored in moderation audit trail">
                  <SelectInput
                    data-testid="moderation-reason-code"
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value)}
                  >
                    <option value="policy_manual_review">policy_manual_review</option>
                    <option value="policy_safe_service_media">policy_safe_service_media</option>
                    <option value="policy_prohibited_content">policy_prohibited_content</option>
                    <option value="policy_unrelated_media">policy_unrelated_media</option>
                  </SelectInput>
                </Field>

                <Field label="Moderator notes" hint="Optional notes for handoff and traceability">
                  <TextArea
                    data-testid="moderation-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add a short rationale"
                  />
                </Field>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    data-testid="moderation-approve"
                    disabled={submitting}
                    onClick={() => {
                      void onReview("approved");
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="moderation-reject"
                    disabled={submitting}
                    onClick={() => {
                      void onReview("rejected");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </section>
  );
}

export default function ModerationPage(): React.JSX.Element {
  return (
    <PageShell>
      <RequireAdminSession>
        <ModerationContent />
      </RequireAdminSession>
    </PageShell>
  );
}
