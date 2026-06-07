"use client";

import Link from "next/link";
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
  listJobs,
  markPaymentDone,
  markPaymentReceived,
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
    throw new Error("Browser does not support file checksums.");
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
  const [decisionReason, setDecisionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      if (foundJob) {
        const mediaPage = await listJobMediaPage(foundJob.id, accessToken).catch(() => ({ items: [], nextCursor: null }));
        setJobMedia(mediaPage.items.filter((asset) => asset.purpose === "job"));
      } else {
        setJobMedia([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load job");
    } finally {
      setLoading(false);
    }
  }, [accessToken, jobId]);

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

  const runAction = async (
    actionKey: string,
    operation: () => Promise<JobRecord | JobApplicationRecord | ProfileRecord | void>
  ): Promise<void> => {
    setActionLoading(actionKey);
    setActionError(null);
    setActionSuccess(null);
    try {
      await operation();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const onApply = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !job) {
      return;
    }
    await runAction("apply", async () => {
      const created = await applyToJob(
        job.id,
        { message: applyMessage.trim() || undefined },
        accessToken
      );
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
      setActionSuccess("Pending application removed.");
    });
  };

  const onAcceptApplicant = async (applicationId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    await runAction(`accept-${applicationId}`, async () => {
      await acceptJobApplication(applicationId, accessToken);
      await loadJobContext();
      setActionSuccess("Applicant approved. Booking lifecycle is now active.");
    });
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

  const onLifecycleAction = async (
    actionKey: string,
    operation: () => Promise<JobRecord>,
    successMessage: string
  ): Promise<void> => {
    await runAction(actionKey, async () => {
      const updated = await operation();
      setJob(updated);
      await loadJobContext();
      setActionSuccess(successMessage);
    });
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setUploadFile(event.target.files?.[0] ?? null);
    setMediaMessage(null);
    setMediaError(null);
  };

  const clearUploadFile = (): void => {
    setUploadFile(null);
    setMediaMessage(null);
    setMediaError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onUploadJobMedia = async (): Promise<void> => {
    if (!accessToken || !job || !uploadFile) {
      setMediaError("Choose a job photo or video first.");
      return;
    }
    const contentType = uploadFile.type.trim().toLowerCase();
    const kind = inferMediaKind(contentType);
    if (!kind) {
      setMediaError("Only job photos and videos are supported.");
      return;
    }

    setUploadingMedia(true);
    setMediaError(null);
    setMediaMessage(null);
    try {
      const checksumSha256 = await sha256Hex(uploadFile);
      const ticket = await createMediaUploadTicket(
        {
          kind,
          purpose: "job",
          jobId: job.id,
          contentType,
          fileSizeBytes: uploadFile.size,
          checksumSha256,
          originalFileName: uploadFile.name
        },
        accessToken
      );
      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body: uploadFile
      });
      if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);
      const etag = uploadResponse.headers.get("etag")?.replaceAll('"', "");
      await completeMediaUpload(ticket.mediaId, { etag: etag || undefined }, accessToken);
      const mediaPage = await listJobMediaPage(job.id, accessToken);
      setJobMedia(mediaPage.items.filter((asset) => asset.purpose === "job"));
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMediaMessage("Job media uploaded. It will appear after review.");
    } catch (requestError) {
      setMediaError(requestError instanceof Error ? requestError.message : "Unable to upload job media");
    } finally {
      setUploadingMedia(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Job details"
            title="Applications and lifecycle"
            subtitle="Review applicants, approve/reject, and continue the booking lifecycle."
            actions={
              <Link href={backToJobsHref}>
                <Button variant="ghost">Back to jobs</Button>
              </Link>
            }
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}
              {loading ? <p className="muted-text">Loading job...</p> : null}
              {!loading && !job ? (
                <Card className="stack">
                  <h3>Job not found</h3>
                  <p className="muted-text">This job is not visible to your account.</p>
                </Card>
              ) : null}

              {job ? (
                <div className="grid two" style={{ alignItems: "start" }}>
                  <Card className="stack">
                    <StatusLabel tone="info">{job.status.replaceAll("_", " ")}</StatusLabel>
                    <h2 style={{ fontFamily: "var(--font-display)" }}>{job.title}</h2>
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
                    <MediaPreviewGrid
                      items={approvedMedia(jobMedia)}
                      emptyText="No approved job photos or videos yet."
                      testId="job-detail-media-grid"
                    />
                  </Card>

                  <div className="stack">
                    {!isOwner && job.status === "posted" ? (
                      <Card className="stack">
                        <h3 style={{ fontFamily: "var(--font-display)" }}>Apply for this job</h3>
                        {myApplication && isPendingApplication(myApplication.status) ? (
                          <>
                            <p className="muted-text">
                              Your pending application was submitted on{" "}
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
                                : "Remove pending application"}
                            </Button>
                          </>
                        ) : (
                          <form className="stack" onSubmit={(event) => void onApply(event)}>
                            <Field label="Message (optional)">
                              <TextArea
                                value={applyMessage}
                                onChange={(event) => setApplyMessage(event.target.value)}
                                placeholder="I can complete this work today."
                                minLength={0}
                              />
                            </Field>
                            <Button type="submit" disabled={actionLoading === "apply"}>
                              {actionLoading === "apply" ? "Applying..." : "Apply for job"}
                            </Button>
                          </form>
                        )}
                      </Card>
                    ) : null}

                    {(isOwner || isAssignedProvider) && (
                      <Card className="stack">
                        <h3 style={{ fontFamily: "var(--font-display)" }}>Lifecycle actions</h3>
                        <p className="muted-text">
                          Continue the assigned job lifecycle after approval.
                        </p>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {isAssignedProvider && job.status === "accepted" ? (
                            <Button
                              type="button"
                              disabled={actionLoading === "start"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "start",
                                  () => startBooking(job.id, accessToken!),
                                  "Job started."
                                )
                              }
                            >
                              Start job
                            </Button>
                          ) : null}
                          {isOwner && job.status === "accepted" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={actionLoading === "revoke-assignment"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "revoke-assignment",
                                  () =>
                                    revokeJobAssignment(
                                      job.id,
                                      { reason: revokeReason.trim() || undefined },
                                      accessToken!
                                    ),
                                  "Assignment revoked."
                                )
                              }
                            >
                              Revoke assignment
                            </Button>
                          ) : null}
                          {isOwner && job.status === "in_progress" ? (
                            <Button
                              type="button"
                              disabled={actionLoading === "complete"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "complete",
                                  () => completeBooking(job.id, accessToken!),
                                  "Job marked completed."
                                )
                              }
                            >
                              Mark completed
                            </Button>
                          ) : null}
                          {isOwner && job.status === "completed" ? (
                            <Button
                              type="button"
                              disabled={actionLoading === "payment-done"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "payment-done",
                                  () => markPaymentDone(job.id, accessToken!),
                                  "Payment marked done."
                                )
                              }
                            >
                              Mark payment done
                            </Button>
                          ) : null}
                          {isAssignedProvider && job.status === "payment_done" ? (
                            <Button
                              type="button"
                              disabled={actionLoading === "payment-received"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "payment-received",
                                  () => markPaymentReceived(job.id, accessToken!),
                                  "Payment marked received."
                                )
                              }
                            >
                              Mark payment received
                            </Button>
                          ) : null}
                          {isOwner && job.status === "payment_received" ? (
                            <Button
                              type="button"
                              disabled={actionLoading === "close"}
                              onClick={() =>
                                void onLifecycleAction(
                                  "close",
                                  () => closeBooking(job.id, accessToken!),
                                  "Job closed."
                                )
                              }
                            >
                              Close job
                            </Button>
                          ) : null}
                        </div>
                        {(job.status === "posted" || job.status === "accepted" || job.status === "in_progress") &&
                        (isOwner || isAssignedProvider) ? (
                          <form
                            className="stack"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void onLifecycleAction(
                                "cancel",
                                () =>
                                  cancelBooking(
                                    job.id,
                                    { reason: cancelReason.trim() || undefined },
                                    accessToken!
                                  ),
                                "Booking cancelled."
                              );
                            }}
                          >
                            <Field label="Cancel reason (optional)">
                              <TextArea
                                value={cancelReason}
                                onChange={(event) => setCancelReason(event.target.value)}
                                placeholder="Optional reason for cancellation."
                              />
                            </Field>
                            <Button type="submit" variant="ghost" disabled={actionLoading === "cancel"}>
                              {actionLoading === "cancel" ? "Cancelling..." : "Cancel booking"}
                            </Button>
                          </form>
                        ) : null}
                        {isOwner && job.status === "accepted" ? (
                          <Field label="Assignment revoke reason (optional)">
                            <TextArea
                              value={revokeReason}
                              onChange={(event) => setRevokeReason(event.target.value)}
                              placeholder="Optional reason shown in audit trail."
                            />
                          </Field>
                        ) : null}
                      </Card>
                    )}
                    {isOwner ? (
                      <Card className="stack">
                        <MediaUploadPanel
                          title="Job photos and videos"
                          description="Add context for the work. Approved media follows this job's visibility rules."
                          pickerLabel="Add job media"
                          uploadLabel="Upload job media"
                          selectedFile={uploadFile}
                          inputRef={fileInputRef}
                          pendingItems={pendingReviewMedia(jobMedia)}
                          error={mediaError}
                          success={mediaMessage}
                          uploading={uploadingMedia}
                          testId="job-media-upload"
                          onFileChange={onFileChange}
                          onClearFile={clearUploadFile}
                          onUpload={() => void onUploadJobMedia()}
                        />
                      </Card>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {job && isOwner ? (
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Applicants</h3>
                  {applications.length === 0 ? (
                    <EmptyState
                      title="No applications yet"
                      body="Once people apply, you can approve or reject them here."
                    />
                  ) : (
                    <div className="grid two">
                      {applications.map((application) => (
                        <Card key={application.id} className="stack">
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
                            {isPendingApplication(application.status) ? (
                              <>
                                <Button
                                  type="button"
                                  disabled={actionLoading === `accept-${application.id}`}
                                  onClick={() => void onAcceptApplicant(application.id)}
                                >
                                  Approve applicant
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
                        </Card>
                      ))}
                    </div>
                  )}
                  <Field label="Decision reason (optional)">
                    <TextArea
                      value={decisionReason}
                      onChange={(event) => setDecisionReason(event.target.value)}
                      placeholder="Optional reason stored in review action."
                    />
                  </Field>
                </Card>
              ) : null}

              {selectedApplicantProfile ? (
                <Card className="stack">
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
                </Card>
              ) : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
