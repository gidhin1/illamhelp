"use client";

import { applicationMessageHint, bookingActions, bookingConfirmation, bookingControls, formatUiError, validateApplicationMessage, type BookingAction } from "@illamhelp/shared-types";

import { LinkButton } from "@/components/ui/LinkButton";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import {
  approvedMedia,
  MediaUploadPanel,
  pendingReviewMedia
} from "@/components/media/MediaUploadPanel";
import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
import { PageShell } from "@/components/PageShell";
import { PersonSummary } from "@/components/PersonSummary";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  acceptJobApplication,
  applyToJob,
  cancelBooking,
  closeBooking,
  completeBooking,
  completeMediaUpload,
  createMediaUploadTicket,
  formatDate,
  getProfileByUserId,
  JobApplicationRecord,
  JobRecord,
  listJobApplications,
  listJobMediaPage,
  listOwnJobMedia,
  listJobs,
  markPaymentDone,
  markPaymentReceived,
  MediaAssetRecord,
  MediaKind,
  ProfileRecord,
  PublicMediaAssetRecord,
  rejectJobApplication,
  revokeJobAssignment,
  startBooking,
  withdrawJobApplication
} from "@/lib/api";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  StatusLabel,
  TextArea
} from "@/components/ui/primitives";

function isPendingApplication(status: JobApplicationRecord["status"]): boolean {
  return status === "applied" || status === "shortlisted";
}

function inferMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Try uploading this file in a different browser.");
  }
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function JobDetailPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<JobRecord | null>(null);
  const [applications, setApplications] = useState<JobApplicationRecord[]>([]);
  const [ownJobMedia, setOwnJobMedia] = useState<MediaAssetRecord[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState<string | null>(null);
  const [jobMedia, setJobMedia] = useState<PublicMediaAssetRecord[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [selectedApplicantProfile, setSelectedApplicantProfile] = useState<ProfileRecord | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [bookingDecision, setBookingDecision] = useState<"cancel" | "revoke" | null>(null);
  const [bookingReason, setBookingReason] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshJobMedia = useCallback(async (id: string, owner: boolean): Promise<void> => {
    if (!accessToken) return;
    setMediaLoading(true);
    setMediaLoadError(null);
    try {
      const [approved, owned] = await Promise.allSettled([
        listJobMediaPage(id, accessToken),
        owner ? listOwnJobMedia(id, accessToken) : Promise.resolve([])
      ]);
      if (approved.status === "fulfilled") setJobMedia(approved.value.items);
      if (owned.status === "fulfilled") setOwnJobMedia(owned.value);
      if (approved.status === "rejected" || owned.status === "rejected") {
        setMediaLoadError("Couldn’t refresh job media. Try refreshing again.");
      }
    } finally {
      setMediaLoading(false);
    }
  }, [accessToken]);

  const loadJobContext = useCallback(async (): Promise<void> => {
    if (!accessToken || !jobId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, applicationRows] = await Promise.all([
        listJobs(accessToken, { limit: 200 }),
        listJobApplications(jobId, accessToken)
      ]);
      const foundJob = jobsResult.items.find((item) => item.id === jobId) ?? null;
      setJob(foundJob);
      setApplications(
        [...applicationRows].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      );
      if (foundJob) void refreshJobMedia(foundJob.id, foundJob.seekerUserId === user?.publicUserId);
    } catch (requestError) {
      setError(formatUiError(requestError, "Couldn’t load this job. Go back and try opening it again."));
    } finally {
      setLoading(false);
    }
  }, [accessToken, jobId, refreshJobMedia, user?.publicUserId]);

  useEffect(() => {
    void loadJobContext();
  }, [loadJobContext]);

  useEffect(() => {
    if (!accessToken || !job) return;
    const ids = Array.from(
      new Set(
        [
          job.seekerUserId,
          job.assignedProviderUserId,
          ...applications.map((application) => application.providerUserId)
        ].filter((userId): userId is string => Boolean(userId))
      )
    ).filter((userId) => !profilesByUserId[userId]);
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (userId) => {
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
    return () => {
      cancelled = true;
    };
  }, [accessToken, applications, job, profilesByUserId]);

  const isOwner = useMemo(() => {
    if (!job || !user?.publicUserId) {
      return false;
    }
    return job.seekerUserId === user.publicUserId;
  }, [job, user?.publicUserId]);

  const isAssignedProvider = useMemo(() => {
    if (!job || !user?.publicUserId) {
      return false;
    }
    return job.assignedProviderUserId === user.publicUserId;
  }, [job, user?.publicUserId]);

  const myApplication = useMemo(() => {
    if (!user?.publicUserId) {
      return null;
    }
    return (
      applications.find((application) => application.providerUserId === user.publicUserId) ?? null
    );
  }, [applications, user?.publicUserId]);

  const backToJobsHref = useMemo(() => {
    if (isOwner) {
      return "/jobs/posted";
    }

    if (isAssignedProvider) {
      return "/jobs/assigned";
    }

    return "/jobs/discover";
  }, [isAssignedProvider, isOwner]);

  useEffect(() => {
    if (isOwner && window.location.hash === "#job-applicants") {
      document.getElementById("job-applicants")?.scrollIntoView();
    }
  }, [isOwner]);

  const runAction = async (
    actionKey: string,
    operation: () => Promise<JobRecord | JobApplicationRecord | ProfileRecord | void>,
    showError = setActionError
  ): Promise<void> => {
    if (actionLoading) return;
    setActionLoading(actionKey);
    setActionError(null);
    setActionSuccess(null);
    try {
      await operation();
    } catch (requestError) {
      showError(formatUiError(requestError, "Couldn’t update this job. Refresh the job and try again."));
    } finally {
      setActionLoading(null);
    }
  };

  const onApply = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !job || actionLoading) return;
    const validationError = validateApplicationMessage(applyMessage);
    setApplicationError(validationError);
    if (validationError) return;
    await runAction("apply", async () => {
      let created: JobApplicationRecord;
      try {
        created = await applyToJob(job.id, { message: applyMessage.trim() || undefined }, accessToken);
      } catch (requestError) {
        setApplicationError(formatUiError(requestError, "Couldn’t send your application. Check that the job is still open and try again."));
        return;
      }
      setApplications((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      setApplyMessage("");
      setActionSuccess("Application submitted.");
    });
  };

  const onWithdraw = async (application: JobApplicationRecord): Promise<void> => {
    if (!accessToken) {
      return;
    }
    await runAction("withdraw", async () => {
      const updated = await withdrawJobApplication(application.id, accessToken);
      setApplications((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setActionSuccess("Application withdrawn.");
    });
  };

  const onAcceptApplicant = async (application: JobApplicationRecord): Promise<void> => {
    if (!accessToken || !job || job.status !== "posted" || !isOwner || actionLoading) return;
    if (assigningId !== application.id || !isPendingApplication(application.status)) return;
    setAssignmentError(null);
    await runAction(`accept-${application.id}`, async () => {
      const accepted = await acceptJobApplication(application.id, accessToken);
      setJob((previous) => previous?.id === job.id
        ? { ...previous, status: "accepted", assignedProviderUserId: accepted.providerUserId }
        : previous);
      setApplications((previous) => previous.map((item) => item.id === accepted.id ? accepted : item));
      setAssigningId(null);
      await loadJobContext();
      setActionSuccess("Job assigned.");
    }, setAssignmentError);
  };

  const onRejectApplicant = async (applicationId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    await runAction(`reject-${applicationId}`, async () => {
      await rejectJobApplication(
        applicationId,
        { reason: decisionReason.trim() || undefined },
        accessToken
      );
      await loadJobContext();
      setDecisionReason("");
      setActionSuccess("Applicant rejected.");
    });
  };

  const onViewApplicantProfile = async (providerUserId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    await runAction(`profile-${providerUserId}`, async () => {
      const profile = await getProfileByUserId(providerUserId, accessToken);
      setSelectedApplicantProfile(profile);
      setActionSuccess(`Loaded profile for ${profile.displayName}.`);
    });
  };

  const onLifecycleAction = async (action: BookingAction): Promise<void> => {
    if (!job || !accessToken) return;
    const reason = { reason: bookingReason.trim() || undefined };
    const operations = {
      start: () => startBooking(job.id, accessToken),
      complete: () => completeBooking(job.id, accessToken),
      "payment-done": () => markPaymentDone(job.id, accessToken),
      "payment-received": () => markPaymentReceived(job.id, accessToken),
      close: () => closeBooking(job.id, accessToken),
      revoke: () => revokeJobAssignment(job.id, reason, accessToken),
      cancel: () => cancelBooking(job.id, reason, accessToken)
    };
    setBookingError(null);
    setBookingSuccess(null);
    await runAction(action, async () => {
      const updated = await operations[action]();
      setJob(updated);
      setBookingDecision(null);
      setBookingReason("");
      setBookingSuccess(bookingActions[action].success);
      if (action === "revoke" || action === "cancel") {
        const refreshed = await listJobApplications(job.id, accessToken).catch(() => null);
        if (refreshed) setApplications(refreshed);
      }
    }, setBookingError);
  };

  const booking = job && (isOwner || isAssignedProvider)
    ? bookingControls(job.status, isOwner ? "owner" : "provider")
    : null;
  const activeBookingDecision = bookingDecision === "cancel" && booking?.canCancel ||
    bookingDecision === "revoke" && booking?.canRevoke ? bookingDecision : null;

  const reviewBookingDecision = (decision: "cancel" | "revoke" | null): void => {
    setBookingDecision(decision);
    setBookingReason("");
    setBookingError(null);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = Array.from(event.target.files ?? []);
    setUploadFiles((previous) => [...previous, ...selected]);
    setMediaMessage(null);
    setMediaError(null);
  };

  const clearUploadFile = (): void => {
    setUploadFiles([]);
    setMediaMessage(null);
    setMediaError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUploadFile = (index: number): void => {
    setUploadFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setMediaMessage(null);
    setMediaError(null);
  };

  const onUploadJobMedia = async (): Promise<void> => {
    if (uploadingMedia) return;
    if (!accessToken || !job || uploadFiles.length === 0) {
      setMediaError("Choose one or more job photos or videos first.");
      return;
    }
    const invalidFile = uploadFiles.find((file) => !inferMediaKind(file.type.trim().toLowerCase()));
    if (invalidFile) {
      setMediaError(`Only job photos and videos are supported. Remove ${invalidFile.name}.`);
      return;
    }

    setUploadingMedia(true);
    setMediaError(null);
    setMediaMessage(null);
    let uploadedCount = 0;
    try {
      for (const file of uploadFiles) {
        const contentType = file.type.trim().toLowerCase();
        const kind = inferMediaKind(contentType);
        if (!kind) continue;
        const checksumSha256 = await sha256Hex(file);
        const ticket = await createMediaUploadTicket(
          {
            kind,
            purpose: "job",
            jobId: job.id,
            contentType,
            fileSizeBytes: file.size,
            checksumSha256,
            originalFileName: file.name
          },
          accessToken
        );
        const uploadResponse = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: ticket.requiredHeaders,
          body: file
        });
        if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);
        const etag = uploadResponse.headers.get("etag")?.replaceAll('"', "");
        const uploaded = await completeMediaUpload(ticket.mediaId, { etag: etag || undefined }, accessToken);
        setOwnJobMedia((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
        uploadedCount += 1;
        setUploadFiles((previous) => previous.slice(1));
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (requestError) {
      setMediaError(formatUiError(requestError, "Couldn’t upload the remaining files. Try uploading them again."));
    } finally {
      if (uploadedCount) setMediaMessage(`${uploadedCount} job ${uploadedCount === 1 ? "file" : "files"} uploaded for review.`);
      setUploadingMedia(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Job details"
            title={job && !isOwner ? job.title : "Manage this job"}
            subtitle={isOwner ? "Review applications, assign the job, and update its status." : undefined}
            actions={
              <>
                <LinkButton href={backToJobsHref} variant="ghost">Back to jobs</LinkButton>
                {isOwner ? <a className="button secondary" href="#job-applicants">Review applicants</a> : null}
                {booking ? <a className="button secondary" href="#job-booking">Go to booking</a> : null}
                {isOwner ? <a className="button secondary" href="#job-media">Manage job media</a> : null}
              </>
            }
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}
              {loading ? <p className="muted-text">Loading job...</p> : null}
              {!loading && !job ? (
                <Card variant="action" className="stack">
                  <h3>Job not found</h3>
                  <p className="muted-text">This job is not visible to your account.</p>
                </Card>
              ) : null}

              {job ? (
                <div className="grid two" style={{ alignItems: "start" }}>
                  <Card variant="record" className="stack">
                    <StatusLabel tone="info">{job.status.replaceAll("_", " ")}</StatusLabel>
                    <h2>{isOwner ? job.title : "About this job"}</h2>
                    <div className="data-meta">
                      {job.category} · {job.locationText}
                    </div>
                    <div className="data-meta">
                      Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
                    </div>
                    <div className="data-row">
                      <div className="data-title">Posted by</div>
                      <PersonSummary userId={job.seekerUserId} profile={profilesByUserId[job.seekerUserId]} compact />
                    </div>
                    <div className="data-row">
                      <div className="data-title">Assigned provider</div>
                      {job.assignedProviderUserId ? (
                        <PersonSummary
                          userId={job.assignedProviderUserId}
                          profile={profilesByUserId[job.assignedProviderUserId]}
                          compact
                        />
                      ) : (
                        <div className="data-meta">No provider assigned yet</div>
                      )}
                    </div>
                    <div className="field-hint">Created: {formatDate(job.createdAt)}</div>
                    <div className="field-hint">Updated: {formatDate(job.updatedAt)}</div>
                    <div className="data-row">
                      <div className="data-title">Description</div>
                      <div className="data-meta">{job.description}</div>
                    </div>
                    {!isOwner ? (
                      <>
                        {mediaLoadError ? <Banner tone="error">{mediaLoadError}</Banner> : null}
                        <MediaPreviewGrid
                          items={approvedMedia(jobMedia.filter((asset) => asset.jobId === job.id))}
                          emptyText={mediaLoading ? "Loading job media…" : "No approved job photos or videos yet."}
                          testId="job-detail-media-grid"
                        />
                        {mediaLoadError ? <Button type="button" variant="secondary" disabled={mediaLoading} onClick={() => void refreshJobMedia(job.id, false)}>Refresh job media</Button> : null}
                      </>
                    ) : null}
                  </Card>

                  <div className="stack">
                    {!isOwner && job.status === "posted" ? (
                      <Card variant="action" className="stack" id="job-application">
                        <h2>{myApplication && isPendingApplication(myApplication.status) ? "Your application" : "Apply for this job"}</h2>
                        {myApplication && isPendingApplication(myApplication.status) ? (
                          <>
                            <p className="muted-text">
                              Application submitted on{" "}
                              {formatDate(myApplication.createdAt)}.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={actionLoading === "withdraw"}
                              onClick={() => void onWithdraw(myApplication)}
                            >
                              {actionLoading === "withdraw"
                                ? "Removing..."
                                : "Withdraw application"}
                            </Button>
                          </>
                        ) : (
                          <form className="stack" onSubmit={(event) => void onApply(event)}>
                            <Field label="Message to the job poster (optional)" hint={applicationMessageHint} error={applicationError ?? undefined}>
                              <TextArea
                                value={applyMessage}
                                onChange={(event) => { setApplyMessage(event.target.value); setApplicationError(null); }}
                                readOnly={actionLoading === "apply"}
                              />
                            </Field>
                            <Button type="submit" disabled={actionLoading === "apply"}>
                              {actionLoading === "apply" ? "Submitting..." : "Submit application"}
                            </Button>
                          </form>
                        )}
                      </Card>
                    ) : null}

                    {isOwner ? (
                      <Card variant="review" className="stack" id="job-applicants">
                        <h2>Applicants</h2>
                        {job.assignedProviderUserId ? <p>Assigned to {profilesByUserId[job.assignedProviderUserId]?.displayName || job.assignedProviderUserId}</p> : null}
                        {applications.length === 0 ? (
                          <EmptyState
                            title="No applications yet"
                            body="When people apply, review their profiles and messages here."
                          />
                        ) : (
                          <div className="card-row-list">
                            {applications.map((application) => (
                              <article key={application.id} className="card-list-row stack">
                                <StatusLabel tone="info">{application.status.replaceAll("_", " ")}</StatusLabel>
                                <PersonSummary
                                  userId={application.providerUserId}
                                  profile={profilesByUserId[application.providerUserId]}
                                  compact
                                />
                                <div className="data-meta">
                                  Applied: {formatDate(application.createdAt)}
                                </div>
                                {application.message ? (
                                  <div className="data-meta">Message: {application.message}</div>
                                ) : null}
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={actionLoading === `profile-${application.providerUserId}`}
                                    onClick={() => void onViewApplicantProfile(application.providerUserId)}
                                  >
                                    View profile
                                  </Button>
                                  {job.status === "posted" && isPendingApplication(application.status) && assigningId !== application.id ? (
                                    <>
                                      <Button
                                        type="button"
                                        disabled={!!actionLoading}
                                        onClick={() => { setAssigningId(application.id); setAssignmentError(null); }}
                                      >
                                        Review assignment
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={actionLoading === `reject-${application.id}`}
                                        onClick={() => void onRejectApplicant(application.id)}
                                      >
                                        Reject applicant
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                                {selectedApplicantProfile?.userId === application.providerUserId ? (
                                  <div className="stack job-review-panel">
                                    <h3 style={{ fontFamily: "var(--font-display)" }}>Applicant profile preview</h3>
                                    <PersonSummary userId={selectedApplicantProfile.userId} profile={selectedApplicantProfile} />
                                    <div className="data-meta">
                                      Location:{" "}
                                      {[selectedApplicantProfile.city, selectedApplicantProfile.area]
                                        .filter(Boolean)
                                        .join(", ") || "Not provided"}
                                    </div>
                                    <div className="data-meta">
                                      Services:{" "}
                                      {selectedApplicantProfile.serviceCategories.length > 0
                                        ? selectedApplicantProfile.serviceCategories.join(", ")
                                        : "Not provided"}
                                    </div>
                                    <div className="data-meta">
                                      Phone:{" "}
                                      {selectedApplicantProfile.visibility.phone
                                        ? selectedApplicantProfile.contact.phone ?? "Not provided"
                                        : selectedApplicantProfile.contact.phoneMasked ?? "Hidden"}
                                    </div>
                                  </div>
                                ) : null}
                                {job.status === "posted" && isPendingApplication(application.status) && assigningId === application.id ? (
                                  <div className="stack job-review-panel">
                                    <p>Assign this job to {profilesByUserId[application.providerUserId]?.displayName || application.providerUserId}? Other pending applications for this job will close.</p>
                                    {assignmentError ? <Banner tone="error">{assignmentError}</Banner> : null}
                                    <div className="job-mobile-actions">
                                      <Button type="button" disabled={!!actionLoading} onClick={() => void onAcceptApplicant(application)}>
                                        {actionLoading === `accept-${application.id}` ? "Assigning..." : "Assign job"}
                                      </Button>
                                      <Button type="button" variant="ghost" disabled={!!actionLoading} onClick={() => setAssigningId(null)}>Keep reviewing</Button>
                                    </div>
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        )}
                        {job.status === "posted" && applications.some((application) => isPendingApplication(application.status)) ? (
                        <Field label="Decision reason (optional)" hint="Used when you reject an application.">
                          <TextArea
                            value={decisionReason}
                            onChange={(event) => setDecisionReason(event.target.value)}
                            placeholder="You can add a reason for the record."
                          />
                        </Field>
                        ) : null}
                      </Card>
                    ) : null}

                    {booking ? (
                      <Card variant="action" className="stack" id="job-booking">
                        <div className="job-task-copy">
                          <h3>Booking</h3>
                          <p><strong>{booking.label}</strong></p>
                          <p className="muted-text">{booking.next}</p>
                        </div>
                        {bookingError ? <Banner tone="error">{bookingError}</Banner> : null}
                        {bookingSuccess ? <Banner tone="success">{bookingSuccess}</Banner> : null}
                        {activeBookingDecision ? (
                          <form className="stack job-decision" onSubmit={(event) => {
                            event.preventDefault();
                            void onLifecycleAction(activeBookingDecision);
                          }}>
                            <strong>{bookingConfirmation[activeBookingDecision].prompt}</strong>
                            <Field label={bookingConfirmation[activeBookingDecision].reason}>
                              <TextArea value={bookingReason} onChange={(event) => setBookingReason(event.target.value)} />
                            </Field>
                            <div className="job-action-row">
                              <Button type="submit" disabled={!!actionLoading}>
                                {actionLoading ? "Updating…" : bookingActions[activeBookingDecision].label}
                              </Button>
                              <Button type="button" variant="ghost" disabled={!!actionLoading} onClick={() => reviewBookingDecision(null)}>
                                Keep booking
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="job-action-row">
                            {booking.primary ? (
                              <Button type="button" disabled={!!actionLoading} onClick={() => {
                                if (booking.primary) void onLifecycleAction(booking.primary);
                              }}>
                                {actionLoading === booking.primary ? "Updating…" : bookingActions[booking.primary].label}
                              </Button>
                            ) : null}
                            {booking.canRevoke ? (
                              <Button type="button" variant="secondary" disabled={!!actionLoading} onClick={() => reviewBookingDecision("revoke")}>
                                Review revocation
                              </Button>
                            ) : null}
                            {booking.canCancel ? (
                              <Button type="button" variant="ghost" disabled={!!actionLoading} onClick={() => reviewBookingDecision("cancel")}>
                                Review cancellation
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </Card>
                    ) : null}
                    {isOwner ? (
                      <Card variant="action" className="stack" id="job-media">
                        <MediaUploadPanel
                          title="Job photos and videos"
                          description="Add photos or videos of the work. Only people who can view this job can see them after approval."
                          pickerLabel="Choose job photos or videos"
                          uploadLabel="Upload for review"
                          selectedFiles={uploadFiles}
                          inputRef={fileInputRef}
                          pendingItems={pendingReviewMedia(ownJobMedia.filter((asset) => asset.jobId === job.id && asset.state !== "uploaded"))}
                          rejectedItems={ownJobMedia.filter((asset) => asset.jobId === job.id && asset.state === "rejected")}
                          error={mediaError}
                          success={mediaMessage}
                          uploading={uploadingMedia}
                          testId="job-media-upload"
                          onFileChange={onFileChange}
                          onClearFile={clearUploadFile}
                          onRemoveFile={removeUploadFile}
                          onUpload={() => void onUploadJobMedia()}
                        />
                        {mediaLoadError ? <Banner tone="error">{mediaLoadError}</Banner> : null}
                        <h3>Approved media</h3>
                        <MediaPreviewGrid
                          items={approvedMedia(jobMedia.filter((asset) => asset.jobId === job.id))}
                          emptyText={mediaLoading ? "Loading job media…" : "No approved job photos or videos yet."}
                          testId="job-detail-media-grid"
                        />
                        <div><Button type="button" variant="secondary" disabled={mediaLoading || uploadingMedia} onClick={() => void refreshJobMedia(job.id, true)}>
                          {mediaLoading ? "Refreshing media…" : "Refresh job media"}
                        </Button></div>
                      </Card>
                    ) : null}
                  </div>
                </div>
              ) : null}

            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
