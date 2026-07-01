"use client";

import Image from "next/image";
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
  SelectInput,
  TextArea,
  TextInput
} from "@/components/ui/primitives";
import {
  ModerationDetails,
  ModerationProcessResult,
  ModerationQueueItem,
  ProfileRecord,
  getProfileByUserId,
  getModerationDetails,
  listModerationQueue,
  processModerationQueue,
  reviewMedia
} from "@/lib/api";

const statusOptions = ["pending", "running", "approved", "rejected", "error"] as const;

type QueueSortOrder = "oldest" | "newest";

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function purposeLabel(purpose: ModerationQueueItem["purpose"]): string {
  return purpose.replaceAll("_", " ");
}

function privacyState(item: ModerationQueueItem): string {
  if (item.purpose === "verification_document") return "Private verification document";
  if (item.purpose === "profile") return "Profile media";
  return "Job media";
}

function nextModerationAction(item: ModerationQueueItem): string {
  if (item.status === "pending" || item.status === "running") return "Run or inspect checks";
  if (item.mediaState === "human_review_pending") return "Approve or reject";
  return "Review decision history";
}

function profileName(profile: ProfileRecord | undefined, userId: string): string {
  return profile?.displayName || `Member ${shortId(userId)}`;
}

function profileContext(profile: ProfileRecord | undefined, userId: string): string {
  if (!profile) return `Owner ID: ${shortId(userId)}`;
  return [
    [profile.city, profile.area].filter(Boolean).join(", "),
    profile.serviceCategories.slice(0, 2).join(", ")
  ].filter(Boolean).join(" · ") || `Owner ID: ${shortId(userId)}`;
}

function ModerationContent(): React.JSX.Element {
  const { accessToken } = useSession();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [queueSearch, setQueueSearch] = useState("");
  const [queueSortOrder, setQueueSortOrder] = useState<QueueSortOrder>("oldest");
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

  const visibleQueue = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return queue
      .filter((item) => {
        if (!query) return true;
        return [
          item.ownerUserId,
          profileName(profilesByUserId[item.ownerUserId], item.ownerUserId),
          profileContext(profilesByUserId[item.ownerUserId], item.ownerUserId),
          item.mediaId,
          item.purpose,
          item.kind,
          item.status,
          item.mediaState,
          item.reasonCode ?? ""
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const left = new Date(a.moderationCreatedAt).getTime();
        const right = new Date(b.moderationCreatedAt).getTime();
        return queueSortOrder === "oldest" ? left - right : right - left;
      });
  }, [profilesByUserId, queue, queueSearch, queueSortOrder]);

  const queueGroups = useMemo(() => {
    const labels: Array<ModerationQueueItem["purpose"]> = ["verification_document", "profile", "job"];
    return labels
      .map((purpose) => ({
        purpose,
        items: visibleQueue.filter((item) => item.purpose === purpose)
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleQueue]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    void (async () => {
      setLoadingQueue(true);
      try {
        const items = await listModerationQueue(accessToken, { status: statusFilter, limit: 100 });
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
        if (!cancelled) setLoadingQueue(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, selectedMediaId, statusFilter]);

  useEffect(() => {
    if (!accessToken || !selectedMediaId) return;

    let cancelled = false;
    void (async () => {
      setLoadingDetails(true);
      try {
        const result = await getModerationDetails(selectedMediaId, accessToken);
        if (!cancelled) setDetails(result);
      } catch (requestError) {
        if (!cancelled) {
          setDetails(null);
          setBanner({
            tone: "error",
            message: requestError instanceof Error ? requestError.message : "Failed to load moderation details"
          });
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, selectedMediaId]);

  useEffect(() => {
    if (!accessToken) return;
    const userIds = Array.from(
      new Set([
        ...queue.map((item) => item.ownerUserId),
        ...(details ? [details.media.ownerUserId] : [])
      ])
    ).filter((userId) => !profilesByUserId[userId]);
    if (userIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        userIds.map(async (userId) => {
          try {
            return [userId, await getProfileByUserId(userId, accessToken)] as const;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setProfilesByUserId((previous) => ({
          ...previous,
          ...Object.fromEntries(entries.filter((entry): entry is [string, ProfileRecord] => entry !== null))
        }));
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, details, profilesByUserId, queue]);

  async function refreshQueueAndDetails(activeMediaId: string | null): Promise<void> {
    if (!accessToken) return;

    const items = await listModerationQueue(accessToken, { status: statusFilter, limit: 100 });
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
    if (!accessToken) return;

    setSubmitting(true);
    try {
      const result = await processModerationQueue(accessToken, 20);
      setProcessingResult(result);
      await refreshQueueAndDetails(selectedMediaId);
      setBanner({
        tone: "success",
        message: `Processed ${result.processed} jobs (${result.technicalApproved} technical approvals, ${result.aiCompleted} AI decisions).`
      });
    } catch (requestError) {
      setBanner({ tone: "error", message: requestError instanceof Error ? requestError.message : "Failed to process queue" });
    } finally {
      setSubmitting(false);
    }
  }

  async function onReview(decision: "approved" | "rejected"): Promise<void> {
    if (!accessToken || !selectedMediaId) return;

    setSubmitting(true);
    try {
      await reviewMedia(
        selectedMediaId,
        { decision, reasonCode, notes: notes.trim() || undefined },
        accessToken
      );
      await refreshQueueAndDetails(selectedMediaId);
      setNotes("");
      setBanner({
        tone: "success",
        message: decision === "approved" ? "Media approved." : "Media rejected."
      });
    } catch (requestError) {
      setBanner({ tone: "error", message: requestError instanceof Error ? requestError.message : "Failed to submit review" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack admin-review-page">
      <div className="admin-review-topbar">
        <div className="admin-review-title-block">
           <span className="admin-review-kicker">Content Safety</span>
           <h1 className="display-title admin-review-title">Moderation Queue</h1>
        </div>
        <div className="admin-review-actions">
           <Button type="button" variant="secondary" data-testid="moderation-process-pending" disabled={submitting} onClick={() => void onProcessPending()}>
             Run Machine Checks
           </Button>
        </div>
      </div>

      <div className="admin-review-shell">
        {banner && <div style={{ marginBottom: "var(--spacing-md)" }}><Banner tone={banner.tone}>{banner.message}</Banner></div>}
        {processingResult && (
           <div style={{ marginBottom: "var(--spacing-md)" }}>
             <Banner tone="info">Selected: {processingResult.selected}, Processed: {processingResult.processed}, Errors: {processingResult.errors}</Banner>
           </div>
        )}

        <div className="admin-review-layout moderation-layout">
          <Card className="stack admin-review-panel moderation-panel" style={{ padding: 0 }}>
            <div className="admin-review-panel-header">
               <div>
                  <h3>Queue items</h3>
                  <div className="muted-text">
                    {visibleQueue.length} shown · {queueSummary.total} total · {queueSummary.pending} pending · {queueSummary.reviewed} reviewed
                  </div>
               </div>
               <Field label="Status">
                   <SelectInput data-testid="moderation-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-review-status-select">
                     {statusOptions.map((opt) => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
                   </SelectInput>
               </Field>
            </div>
            <div className="admin-review-queue-tools">
              <Field label="Find media or member">
                <TextInput
                  data-testid="moderation-queue-search"
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Member ID, media ID, purpose, status"
                />
              </Field>
              <Field label="Order">
                <SelectInput
                  data-testid="moderation-sort-order"
                  value={queueSortOrder}
                  onChange={(event) => setQueueSortOrder(event.target.value as QueueSortOrder)}
                >
                  <option value="oldest">Oldest first</option>
                  <option value="newest">Newest first</option>
                </SelectInput>
              </Field>
            </div>

            <div className="admin-review-list-wrap">
               {loadingQueue && (
                  <div className="admin-review-loading">Loading queue...</div>
               )}
               {!loadingQueue && visibleQueue.length === 0 ? (
                  <div style={{ padding: "var(--spacing-xl)" }}>
                     <EmptyState title="No items found" body="Try another filter, clear search, or run machine checks to pull new items." />
                  </div>
               ) : (
                  <div className="admin-review-list" role="list" aria-label="Moderation queue">
                    {queueGroups.map((group) => (
                      <div key={group.purpose} className="admin-review-list-group" role="group" aria-label={purposeLabel(group.purpose)}>
                        <div className="admin-review-group-label">{purposeLabel(group.purpose)} · {group.items.length}</div>
                        {group.items.map((item) => {
                          const selected = selectedMediaId === item.mediaId;
                          const ownerProfile = profilesByUserId[item.ownerUserId];
                          return (
                            <button
                              key={item.mediaId}
                              type="button"
                              className={`admin-review-list-item ${selected ? "selected" : ""}`}
                              aria-pressed={selected}
                              onClick={() => setSelectedMediaId(item.mediaId)}
                            >
                              <span className="admin-review-list-row">
                                <strong>{profileName(ownerProfile, item.ownerUserId)}</strong>
                                <span className="pill">{item.mediaState.replaceAll("_", " ")}</span>
                              </span>
                              <span className="muted-text">{profileContext(ownerProfile, item.ownerUserId)}</span>
                              <span className="admin-review-id">Media ID: {shortId(item.mediaId)}</span>
                              <span className="muted-text" style={{ textTransform: "capitalize" }}>{privacyState(item)} · {item.kind}</span>
                              <span className="muted-text">{nextModerationAction(item)} · queued {formatDate(item.moderationCreatedAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
               )}
            </div>
          </Card>

          <Card className="stack admin-review-panel admin-review-detail-panel moderation-panel moderation-details-panel" data-testid="moderation-details-panel">
            <div className="admin-review-detail-header">
              <div>
                <span className="pill">Manual review</span>
                <h3>Review details</h3>
              </div>
              {details ? <span className="admin-review-id">{profileName(profilesByUserId[details.media.ownerUserId], details.media.ownerUserId)} · Media {shortId(details.media.id)}</span> : null}
            </div>
            
            {loadingDetails && <p className="muted-text">Loading Details...</p>}
            
            {!loadingDetails && !details ? (
                <EmptyState title="Select an item" body="Choose a queue item to inspect AI scores and moderation history." />
            ) : details ? (
              <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                <div className="admin-review-facts" data-testid="moderation-media-summary" aria-label="Media review details">
                  <div>
                    <span className="muted-text">Human identity</span>
                    <strong>{profileName(profilesByUserId[details.media.ownerUserId], details.media.ownerUserId)}</strong>
                    <span>{profileContext(profilesByUserId[details.media.ownerUserId], details.media.ownerUserId)}</span>
                    <span>Owner ID: {details.media.ownerUserId}</span>
                  </div>
                  <div>
                    <span className="muted-text">Privacy state</span>
                    <strong>{details.media.purpose.replaceAll("_", " ")}</strong>
                    <span>{details.media.state.replaceAll("_", " ")}</span>
                  </div>
                  <div>
                    <span className="muted-text">Media file</span>
                    <strong>{(details.media.fileSizeBytes / 1024).toFixed(1)} KB</strong>
                    <span>{details.media.kind.toUpperCase()} · {details.media.contentType}</span>
                  </div>
                </div>

                <div className="admin-review-preview" data-testid="moderation-media-preview">
                  {!details.media.previewUrl ? (
                    <Banner tone="info">Preview is not available for this media.</Banner>
                  ) : details.media.kind === "image" ? (
                    <Image
                      data-testid="moderation-preview-image"
                      src={details.media.previewUrl}
                      alt={`Preview ${details.media.id}`}
                      width={1200}
                      height={800}
                      unoptimized
                      priority
                      style={{ maxWidth: "100%", maxHeight: "320px", height: "auto", width: "auto", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <video
                      data-testid="moderation-preview-video"
                      controls
                      preload="metadata"
                      style={{ width: "100%", maxHeight: "320px", borderRadius: "var(--radius-sm)" }}
                    >
                      <source src={details.media.previewUrl} type={details.media.contentType} />
                    </video>
                  )}
                </div>

                <div className="stack admin-review-form">
                    <Field label="Review reason">
                      <SelectInput data-testid="moderation-reason-code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                        <option value="policy_manual_review">Manual review</option>
                        <option value="policy_safe_service_media">Safe service media</option>
                        <option value="policy_prohibited_content">Prohibited content</option>
                        <option value="policy_unrelated_media">Unrelated media</option>
                      </SelectInput>
                    </Field>

                    <Field label="Moderator Notes" hint="Optional internal notes">
                      <TextArea data-testid="moderation-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rationale..." style={{ minHeight: "88px" }} />
                    </Field>

                    <div className="admin-review-decision-actions">
                      <Button type="button" data-testid="moderation-approve" disabled={submitting} onClick={() => void onReview("approved")} style={{ flex: 1 }}>
                        Approve
                      </Button>
                      <Button type="button" variant="secondary" data-testid="moderation-reject" disabled={submitting} onClick={() => void onReview("rejected")} style={{ flex: 1, color: "var(--error-text)" }}>
                        Reject
                      </Button>
                    </div>
                </div>

                <div className="stack" style={{ gap: "8px" }}>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Job log</h4>
                  {details.moderationJobs.map((job) => (
                    <div key={job.id} className="admin-review-job-log-row">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>{job.stage}</div>
                        {job.reasonCode ? <div className="muted-text">Reason: {job.reasonCode}</div> : null}
                      </div>
                      <span className="pill" style={{ padding: "2px 8px" }}>{job.status}</span>
                    </div>
                  ))}
                </div>

              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
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
