"use client";

import { formatUiError } from "@illamhelp/shared-types";

import { ActionControl } from "@illamhelp/ui-web";

import { useEffect, useMemo, useState } from "react";

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
  if (purpose === "verification_document") return "Private verification documents";
  return purpose === "profile" ? "Profile media" : "Job media";
}

const reviewReasons = [
  { value: "policy_manual_review", label: "Manual review" },
  { value: "policy_prohibited_content", label: "Prohibited content" },
  { value: "policy_unrelated_media", label: "Unrelated media" }
];

function stateLabel(value: string): string {
  if (value === "appeal_pending") return "Appeal pending";
  if (value === "human_review_pending") return "Human review pending";
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function screeningLabel(value: string): string {
  const labels: Record<string, string> = {
    clean: "No malware detected",
    unverified: "File checksum could not be verified",
    decoded: "Photo decoded",
    animated_photo: "Animation needs review",
    format_mismatch: "File format mismatch",
    technical_photo_format_mismatch: "File format mismatch",
    malware_detected: "Malware detected",
    no_candidate: "No contact details flagged",
    contact_candidate: "Possible contact details",
    ambiguous_number: "Number needs review",
    not_run: "Check not run",
    disabled: "Check not run",
    unavailable: "Check unavailable",
    no_candidate_in_sample: "No contact details flagged in sampled frames",
    incomplete_frame_check: "Frame check incomplete",
    outside_screening_limits: "Video exceeds screening limits",
    audio_not_checked: "Audio track found. Listen during review.",
    no_audio_stream: "No audio track found",
    silent_audio: "Decoded audio is silent",
    multiple_audio_tracks: "Multiple audio tracks. Check each track.",
    unsupported_audio_language: "Audio language needs review",
    speech_unconfirmed: "Speech could not be confirmed",
    spoken_contact_candidate: "Possible spoken contact details",
    spoken_number_needs_review: "Spoken number needs review",
    no_contact_in_transcript: "No contact details flagged in transcript",
    possible_explicit_imagery: "Possible explicit imagery",
    no_visual_candidate: "No explicit imagery flagged",
    incomplete_visual_check: "Visual check incomplete",
    below_50: "Below 50%",
    "50_to_89": "50% to below 90%",
    "90_or_above": "90% or higher",
    no_scene_sample: "No scene change sampled",
    scene_sampled: "Scene change sampled",
    scene_already_sampled: "Scene change covered by a spaced sample",
    scene_timestamp_unavailable: "Scene timestamp unavailable"
  };
  return labels[value] ?? stateLabel(value);
}

function profileName(profile: ProfileRecord | null | undefined, userId: string): string {
  return profile?.displayName || `Member ${shortId(userId)}`;
}

function profileContext(profile: ProfileRecord | null | undefined, userId: string): string {
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
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord | null>>({});
  const [queueSearch, setQueueSearch] = useState("");
  const [serverQuery, setServerQuery] = useState("");
  const [queueSortOrder, setQueueSortOrder] = useState<QueueSortOrder>("oldest");
  const [details, setDetails] = useState<ModerationDetails | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReviewDecision | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [detailError, setDetailError] = useState<string | null>(null);
  const workspace = useReviewWorkspace("moderation-queue-title", "moderation-review-title");
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [processingResult, setProcessingResult] = useState<ModerationProcessResult | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const visibleQueue = useMemo(() => {
    return [...new Map(queue.map((item) => [item.mediaId, item])).values()];
  }, [queue]);

  useEffect(() => {
    const timer = window.setTimeout(() => setServerQuery(queueSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queueSearch]);

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
        const items = await listModerationQueue(accessToken, {
          status: statusFilter, limit: 100, query: serverQuery, newestFirst: queueSortOrder === "newest"
        });
        if (!cancelled) {
          setQueue(items);
          setBanner((current) => current?.tone === "error" ? null : current);
        }
      } catch (requestError) {
        if (!cancelled) {
          setQueue([]);
          setBanner({
            tone: "error",
            message: formatUiError(requestError, "Couldn’t load uploads. Refresh the queue to try again.")
          });
        }
      } finally {
        if (!cancelled) setLoadingQueue(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, queueRevision, queueSortOrder, serverQuery, statusFilter]);

  useEffect(() => {
    if (!accessToken || !selectedMediaId) return;

    let cancelled = false;
    void (async () => {
      setLoadingDetails(true);
      setDetailError(null);
      try {
        const result = await getModerationDetails(selectedMediaId, accessToken);
        if (!cancelled) setDetails(result);
      } catch (requestError) {
        if (!cancelled) {
          setDetails(null);
          setDetailError(formatUiError(requestError, "Couldn’t load this upload. Try loading the details again."));
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, detailRevision, selectedMediaId]);

  useEffect(() => {
    if (!accessToken) return;
    const userIds = Array.from(
      new Set([
        ...queue.map((item) => item.ownerUserId),
        ...(details ? [details.media.ownerUserId] : [])
      ])
    ).filter((userId) => !(userId in profilesByUserId));
    if (userIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        userIds.map(async (userId) => {
          try {
            return [userId, await getProfileByUserId(userId, accessToken)] as const;
          } catch {
            return [userId, null] as const;
          }
        })
      );
      if (!cancelled) {
        setProfilesByUserId((previous) => ({
          ...previous,
          ...Object.fromEntries(entries)
        }));
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, details, profilesByUserId, queue]);

  function clearReview() {
    setSelectedMediaId(null);
    setDetails(null);
    setDetailError(null);
    setShowPreview(false);
    setReceipt(null);
    setNotes("");
    setReasonCode("");
  }

  function backToQueue() {
    setShowPreview(false);
    if (receipt) clearReview();
    workspace.close();
  }

  function filterQueue(value: string) {
    setStatusFilter(value);
    clearReview();
    workspace.close();
  }

  function openReview(mediaId: string, trigger: HTMLButtonElement) {
    if (selectedMediaId !== mediaId || receipt) {
      clearReview();
      setSelectedMediaId(mediaId);
      setLoadingDetails(true);
      setDetailRevision((current) => current + 1);
    }
    workspace.show(trigger);
  }

  function refreshQueue() {
    setQueueRevision((current) => current + 1);
  }

  function refreshDetails() {
    setDetailRevision((current) => current + 1);
  }

  async function onProcessPending(): Promise<void> {
    if (!accessToken) return;

    setBanner(null);
    setSubmitting(true);
    try {
      const result = await processModerationQueue(accessToken, 20);
      setProcessingResult(result);
      refreshQueue();
      if (selectedMediaId) refreshDetails();
      setBanner({
        tone: "success",
        message: `Processed ${result.processed} jobs (${result.technicalApproved} technical approvals, ${result.aiCompleted} routed to review).`
      });
    } catch (requestError) {
      setBanner({ tone: "error", message: formatUiError(requestError, "Couldn’t run automated checks. Try again.") });
    } finally {
      setSubmitting(false);
    }
  }

  async function onReview(nextDecision: ReviewDecision): Promise<void> {
    if (!accessToken || !selectedMediaId || submitting || !canReview) return;

    setDecisionError(null);
    setSubmitting(true);
    try {
      const reviewed = await reviewMedia(
        selectedMediaId,
        { decision: nextDecision, reasonCode: nextDecision === "rejected" ? reasonCode : undefined, notes: notes.trim() || undefined },
        accessToken
      );
      setDetails((current) => current?.media.id === reviewed.id ? {
        ...current,
        media: { ...current.media, state: reviewed.state },
        moderationJobs: current.moderationJobs.map((job) => job.stage === "human_review" && job.status === "pending" ? {
          ...job, status: nextDecision, reasonCode: nextDecision === "rejected" ? reasonCode : null,
          details: { ...job.details, notes: notes.trim() }
        } : job)
      } : current);
      setQueue((current) => current.filter((item) => item.mediaId !== reviewed.id));
      setReceipt(nextDecision);
      setShowPreview(false);
      setDecision(null);
      refreshQueue();
    } catch (requestError) {
      setDecisionError(formatUiError(requestError, "Couldn’t save the decision. Try again or cancel and refresh the upload."));
    } finally {
      setSubmitting(false);
    }
  }

  const screening = details?.moderationJobs.filter((job) => job.stage === "ai_review" &&
    (typeof job.details?.malwareCheck === "string" || job.reasonCode === "malware_detected" ||
      job.reasonCode === "technical_photo_format_mismatch")).at(-1);
  const screeningChecks = [
    ["Malware", screening?.reasonCode === "malware_detected" ? "malware_detected" : screening?.details.malwareCheck],
    ["Photo format", screening?.reasonCode === "technical_photo_format_mismatch"
      ? "format_mismatch" : screening?.details.photoValidation],
    ["Visible contact details", screening?.details.contactCheck],
    ["Photo visual check", screening?.details.visualCheck],
    ["Sampled video frames", screening?.details.videoFrames],
    ["Video visual check", screening?.details.videoVisualCheck],
    ["Visual model score band", screening?.details.visualConfidence],
    ["Scene changes", screening?.details.videoSceneCheck],
    ["Video audio", screening?.details.videoAudio]
  ] as const;

  const canReview = details?.moderationJobs.some((job) => job.stage === "human_review" && job.status === "pending") ?? false;
  const recordedReview = details?.moderationJobs.find((job) => job.stage === "human_review" && (job.status === "approved" || job.status === "rejected"));
  const recordedNote = recordedReview?.details?.notes;

  return (
    <div className="stack admin-review-page" data-review-open={workspace.open}>
      <div className="admin-review-topbar">
        <div className="admin-review-title-block">
           <h1 className="display-title admin-review-title">Review photos and videos</h1>
        </div>
        <div className="admin-review-actions review-queue-filters">
           <Button type="button" variant="secondary" data-testid="moderation-process-pending" disabled={submitting} onClick={() => void onProcessPending()}>
             Run automated checks
           </Button>
        </div>
      </div>

      <div className="admin-review-shell">
        {banner && <div className="review-queue-filters" style={{ marginBottom: "var(--spacing-md)" }}><Banner tone={banner.tone}>{banner.message}</Banner></div>}
        {processingResult && (
           <div className="review-queue-filters" style={{ marginBottom: "var(--spacing-md)" }}>
             <Banner tone="info">Selected: {processingResult.selected}, Processed: {processingResult.processed}, Errors: {processingResult.errors}</Banner>
           </div>
        )}

        <div className="admin-review-layout moderation-layout">
          <Card variant="summary" className="stack admin-review-panel review-queue-panel" style={{ padding: 0 }}>
            <div className="admin-review-panel-header">
               <div>
                  <h2 id="moderation-queue-title" tabIndex={-1}>Media queue</h2>
                  <p className="muted-text">{visibleQueue.length} {visibleQueue.length === 1 ? "upload" : "uploads"} shown</p>
                  {queue.length === 100 ? <p className="muted-text">Showing the first 100 matches. Refine your search to find a specific upload.</p> : null}
               </div>
               <Button type="button" variant="ghost" disabled={loadingQueue || submitting} onClick={refreshQueue}>Refresh queue</Button>
            </div>
            <div className="admin-review-queue-tools">
               <Field label="Status">
                   <SelectInput data-testid="moderation-status-filter" value={statusFilter} onChange={(e) => filterQueue(e.target.value)}>
                     {statusOptions.map((opt) => <option key={opt} value={opt}>{stateLabel(opt)}</option>)}
                   </SelectInput>
               </Field>
              <Field label="Search uploads or members">
                <TextInput
                  data-testid="moderation-queue-search"
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Member, media ID or purpose"
                  maxLength={160}
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
               {(loadingQueue || queueSearch.trim() !== serverQuery) && (
                  <div className="admin-review-loading">Loading queue...</div>
               )}
               {!loadingQueue && queueSearch.trim() === serverQuery && visibleQueue.length === 0 ? (
                  <div style={{ padding: "var(--spacing-xl)" }}>
                     <EmptyState title="No items found" body="Change the filter, clear your search, or run automated checks." />
                  </div>
               ) : (
                  <div className="admin-review-list" role="region" aria-label="Moderation queue">
                    {queueGroups.map((group) => (
                      <div key={group.purpose} className="admin-review-list-group" role="group" aria-label={purposeLabel(group.purpose)}>
                        <div className="admin-review-group-label">{purposeLabel(group.purpose)} · {group.items.length}</div>
                        {group.items.map((item) => {
                          const selected = selectedMediaId === item.mediaId;
                          const ownerProfile = profilesByUserId[item.ownerUserId];
                          return (
                            <ActionControl
                              key={item.mediaId}
                              type="button"
                              className={`admin-review-list-item ${selected ? "selected" : ""}`}
                              aria-pressed={selected}
                              onClick={(event) => openReview(item.mediaId, event.currentTarget)}
                            >
                              <span className="admin-review-list-row">
                                <strong>{profileName(ownerProfile, item.ownerUserId)}</strong>
                                <span className="pill">{stateLabel(item.mediaState)}</span>
                              </span>
                              <span className="admin-review-id">Media ID: {shortId(item.mediaId)}</span>
                              <span className="muted-text">{item.kind === "image" ? "Photo" : "Video"} · {formatDate(item.moderationCreatedAt)}</span>
                            </ActionControl>
                          );
                        })}
                      </div>
                    ))}
                  </div>
               )}
            </div>
          </Card>

          <Card as="section" id="moderation-review" tabIndex={-1} aria-labelledby="moderation-review-title" variant="review" className="stack admin-review-panel admin-review-detail-panel" data-testid="moderation-details-panel">
            <BackToQueue onClick={backToQueue} />
            <div className="admin-review-detail-header">
              <h2 id="moderation-review-title" tabIndex={-1}>{details ? (details.media.kind === "image" ? "Review photo" : "Review video") : "Review details"}</h2>
              {details ? <span className="pill">{stateLabel(details.media.state)}</span> : null}
            </div>
            {receipt ? <ReviewReceipt>{receipt === "approved" ? "Media approved." : "Media rejected."}</ReviewReceipt> : null}
            {detailError ? (
              <div className="stack">
                <Banner tone="error">{detailError}</Banner>
                <Button type="button" variant="secondary" onClick={refreshDetails}>Retry details</Button>
              </div>
            ) : null}
            {loadingDetails && !details ? <p role="status" className="muted-text">Loading upload…</p> : null}
            {!loadingDetails && !details && !detailError ? (
                <EmptyState title="Select an upload" body="Choose an upload to see its evidence, checks and review history." />
            ) : details ? (
              <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                <div className="admin-review-facts" data-testid="moderation-media-summary" aria-label="Media review details">
                  <div>
                    <span className="muted-text">Member details</span>
                    <strong>{profileName(profilesByUserId[details.media.ownerUserId], details.media.ownerUserId)}</strong>
                    <span>{profileContext(profilesByUserId[details.media.ownerUserId], details.media.ownerUserId)}</span>
                    <span>Owner ID: {details.media.ownerUserId}</span>
                  </div>
                  <div>
                    <span className="muted-text">File access</span>
                    <strong>{purposeLabel(details.media.purpose)}</strong>
                    <span>{details.media.purpose === "verification_document" ? "Stays private" : "Approval follows existing access rules"}</span>
                  </div>
                  <div>
                    <span className="muted-text">Media file</span>
                    <strong>{(details.media.fileSizeBytes / 1024).toFixed(1)} KB</strong>
                    <span>{details.media.contentType}</span>
                    <span className="admin-review-id">{details.media.id}</span>
                  </div>
                </div>

                {screening ? (
                  <section className="stack" aria-labelledby="moderation-screening-title">
                    <h3 id="moderation-screening-title">Screening results</h3>
                    <dl className="admin-screening-results">
                      {screeningChecks.map(([label, result]) => typeof result === "string" ? (
                        <div key={label}><dt>{label}</dt><dd>{screeningLabel(result)}</dd></div>
                      ) : null)}
                    </dl>
                    {typeof screening.details.videoFrameCount === "string" ? (
                      <p className="muted-text">Frames sampled {screening.details.videoFrameCount}</p>
                    ) : null}
                    {typeof screening.details.videoVisualFrameCount === "string" ? (
                      <p className="muted-text">Frames checked for explicit imagery {screening.details.videoVisualFrameCount}</p>
                    ) : null}
                    {typeof screening.details.videoVisualFlaggedSeconds === "string" ? (
                      <p className="muted-text">
                        Visual flags near {screening.details.videoVisualFlaggedSeconds.split(",").map((time) => `${time}s`).join(", ")}
                      </p>
                    ) : null}
                    {typeof screening.details.visualDetector === "string" ? (
                      <p className="muted-text">Visual detector {screening.details.visualDetector}</p>
                    ) : null}
                    {typeof screening.details.videoFlaggedSeconds === "string" ? (
                      <p className="muted-text">
                        Frames flagged at {screening.details.videoFlaggedSeconds.split(",").map((time) => `${time}s`).join(", ")}
                      </p>
                    ) : null}
                    {typeof screening.details.videoAudioFlaggedSeconds === "string" ? (
                      <p className="muted-text">Listen near {screening.details.videoAudioFlaggedSeconds}s</p>
                    ) : null}
                    {typeof screening.details.videoAudioDetector === "string" ? (
                      <p className="muted-text">Speech detector {screening.details.videoAudioDetector}</p>
                    ) : null}
                    {typeof screening.details.contactDetector === "string" ? (
                      <p className="muted-text">Text detector {screening.details.contactDetector}</p>
                    ) : null}
                  </section>
                ) : null}

                <section className="stack" aria-labelledby="media-evidence-title" data-testid="moderation-media-preview">
                  <h3 id="media-evidence-title">Upload evidence</h3>
                  {showPreview && loadingDetails ? <p role="status" className="muted-text">Loading preview…</p> : showPreview ? (
                    <div className="admin-review-preview">
                      <ReviewMediaPreview key={detailRevision} media={details.media} alt="Upload preview" testIdPrefix="moderation-preview" />
                    </div>
                  ) : <p className="muted-text">Open the file to inspect it before deciding.</p>}
                  <div className="review-preview-actions">
                    <Button type="button" variant="secondary" disabled={loadingDetails} onClick={() => {
                      setShowPreview(true);
                      setLoadingDetails(true);
                      refreshDetails();
                    }}>{loadingDetails ? "Refreshing…" : showPreview ? "Refresh preview" : "Preview upload"}</Button>
                    {showPreview ? <Button type="button" variant="ghost" onClick={() => setShowPreview(false)}>Close preview</Button> : null}
                  </div>
                </section>

                {canReview ? (
                  <div className="stack admin-review-form">
                    <h3>{details.media.state === "appeal_pending" ? "Decide owner appeal" : "Record a decision"}</h3>
                    {details.media.state === "appeal_pending" ? (
                      <p className="muted-text">The owner requested another review. The upload stays hidden until approved.</p>
                    ) : null}
                    <Field label="Rejection reason" hint="Required to reject this upload.">
                      <SelectInput data-testid="moderation-reason-code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
                        <option value="">Choose a reason</option>
                        {reviewReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                      </SelectInput>
                    </Field>
                    <Field label="Moderator notes" hint="Optional. These notes are for staff.">
                      <TextArea data-testid="moderation-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a review note" />
                    </Field>
                    <div className="admin-review-decision-actions">
                      <Button type="button" data-testid="moderation-approve" disabled={submitting} onClick={() => { setDecisionError(null); setDecision("approved"); }}>
                        Approve upload
                      </Button>
                      <Button type="button" variant="secondary" data-testid="moderation-reject" disabled={submitting || !reasonCode} onClick={() => { setDecisionError(null); setDecision("rejected"); }}>
                        Reject upload
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="stack admin-review-form">
                    <h3>{recordedReview ? "Recorded decision" : "Review status"}</h3>
                    <p>{recordedReview ? stateLabel(recordedReview.status) : "There is no pending manual review for this upload."}</p>
                    {typeof recordedNote === "string" && recordedNote ? <p>{recordedNote}</p> : null}
                  </div>
                )}

                <div className="stack" style={{ gap: "8px" }}>
                  <h3 style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Processing history</h3>
                  {details.moderationJobs.map((job) => (
                    <div key={job.id} className="admin-review-job-log-row">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>{job.details?.source === "owner_appeal" ? "Owner appeal" : job.stage === "ai_review"
                          ? job.details?.screeningStatus === "human_review_required"
                            ? "Routed to human review"
                            : job.details?.aiScores ? "Historical simulated scores" : stateLabel(job.stage)
                          : stateLabel(job.stage)}</div>
                        {job.reasonCode ? <div className="muted-text">{screeningLabel(job.reasonCode)}</div> : null}
                      </div>
                      <span className="pill" style={{ padding: "2px 8px" }}>{job.status}</span>
                    </div>
                  ))}
                </div>

                {receipt ? <Button type="button" variant="secondary" className="review-receipt-back" onClick={backToQueue}>Return to queue</Button> : null}
                <ReviewConfirmation
                  decision={decision}
                  subject="upload"
                  busy={submitting}
                  onClose={() => setDecision(null)}
                  onConfirm={() => { if (decision) void onReview(decision); }}
                >
                  <p>{decision === "rejected"
                    ? "The upload will stay hidden and the owner will be notified."
                    : details.media.purpose === "verification_document"
                      ? "The document remains private and available for verification review."
                      : "People who already have access will be able to view this upload."}</p>
                  {decision === "rejected" ? <p><strong>Reason</strong> {reviewReasons.find((reason) => reason.value === reasonCode)?.label}</p> : null}
                  {notes.trim() ? <p className="review-confirm-note">{notes.trim()}</p> : null}
                  {decisionError ? <Banner tone="error">{decisionError}</Banner> : null}
                </ReviewConfirmation>
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
