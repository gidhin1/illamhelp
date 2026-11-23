import { mediaChecksum } from "../media-checksum";
import type { JSX } from "react";
import { applicationMessageHint, bookingActions, bookingConfirmation, bookingControls, validateApplicationMessage, type BookingAction } from "@illamhelp/shared-types";

import {
  acceptJobApplication, applyToJob,
  AuthenticatedUser, cancelBooking, closeBooking, completeBooking,
  completeMediaUpload, requestMediaReview,
  createJob, createMediaUploadTicket, formatDate, getProfileByUserId, JobApplicationRecord, JobRecord, listJobApplications, listJobMediaPage, listJobsPage, listMyJobApplications,
  markPaymentDone,
  listOwnJobMedia, markPaymentReceived, MediaAssetRecord, MediaKind, ProfileRecord, PublicMediaAssetRecord, rejectJobApplication,
  revokeJobAssignment,
  startBooking, withdrawJobApplication
} from "../api";

import {
  validateJobPayload, shouldForceSignOut, asError, CreateJobPayload
} from "../utils";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAppStyles } from "../theme-context";
import { AppButton, Banner, CardSurface, InputField, SectionCard, StatusLabel } from "../components";
import { MediaPreviewList } from "../MediaPreviewList";
import {
  approvedMedia,
  MediaUploadPanel,
  pendingReviewMedia,
  PickedMediaFile
} from "../MediaUploadPanel";

function isPendingJobApplicationStatus(status: JobApplicationRecord["status"]): boolean {
  return status === "applied" || status === "shortlisted";
}

function inferMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

function latestApplicationByJob(
  applications: JobApplicationRecord[]
): Record<string, JobApplicationRecord> {
  const sorted = [...applications].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const result: Record<string, JobApplicationRecord> = {};
  for (const application of sorted) {
    if (!result[application.jobId]) {
      result[application.jobId] = application;
    }
  }
  return result;
}

export function JobsScreen({
  accessToken,
  user,
  onSessionInvalid,
  section = "discover"
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
  section?: "discover" | "posted" | "assigned";
}): JSX.Element {
  const styles = useAppStyles();
  const currentUserId = user.publicUserId;
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobMediaByJobId, setJobMediaByJobId] = useState<Record<string, PublicMediaAssetRecord[]>>({});
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [myApplicationsByJob, setMyApplicationsByJob] = useState<
    Record<string, JobApplicationRecord>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "connections_only">("public");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postedJob, setPostedJob] = useState<JobRecord | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<string | null>(null);
  const [jobActionSuccess, setJobActionSuccess] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [openDiscoverJobId, setOpenDiscoverJobId] = useState<string | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [bookingDecision, setBookingDecision] = useState<{ jobId: string; action: "cancel" | "revoke" } | null>(null);
  const [bookingReason, setBookingReason] = useState("");
  const [bookingNotice, setBookingNotice] = useState<{ jobId: string; tone: "success" | "error"; message: string } | null>(null);
  const [applicantCountsByJob, setApplicantCountsByJob] = useState<Record<string, number>>({});
  const [applicantCountsLoadingByJob, setApplicantCountsLoadingByJob] = useState<
    Record<string, boolean>
  >({});
  const [ownJobManagerVisible, setOwnJobManagerVisible] = useState(false);
  const [ownMedia, setOwnMedia] = useState<MediaAssetRecord[]>([]);
  const [jobMediaLoading, setJobMediaLoading] = useState(false);
  const [jobMediaLoadError, setJobMediaLoadError] = useState<string | null>(null);
  const [jobMediaError, setJobMediaError] = useState<string | null>(null);
  const [jobMediaSuccess, setJobMediaSuccess] = useState<string | null>(null);
  const [jobMediaUploading, setJobMediaUploading] = useState(false);
  const [pickedJobMediaFiles, setPickedJobMediaFiles] = useState<PickedMediaFile[]>([]);

  const [selectedOwnJobId, setSelectedOwnJobId] = useState<string | null>(null);
  const [selectedOwnJobApplications, setSelectedOwnJobApplications] = useState<
    JobApplicationRecord[]
  >([]);
  const [selectedApplicantProfile, setSelectedApplicantProfile] = useState<ProfileRecord | null>(
    null
  );
  const [selectedOwnJobLoading, setSelectedOwnJobLoading] = useState(false);

  const latestDraftRef = useRef<CreateJobPayload>({
    category: "",
    title: "",
    description: "",
    locationText: "",
    visibility: "public"
  });

  const managerApplications = selectedOwnJobApplications.filter((application) => application.jobId === selectedOwnJobId);

  const jobsPostedByMe = useMemo(
    () => jobs.filter((job) => job.seekerUserId === currentUserId),
    [jobs, currentUserId]
  );
  const jobsAssignedToMe = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            job.assignedProviderUserId === currentUserId && job.seekerUserId !== currentUserId
        ),
    [jobs, currentUserId]
  );
  const jobsFromConnectedPeople = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            job.seekerUserId !== currentUserId &&
            job.assignedProviderUserId !== currentUserId &&
            (job.visibility === "connections_only" || job.status !== "posted")
        ),
    [jobs, currentUserId]
  );
  const publicJobs = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            job.seekerUserId !== currentUserId &&
            job.assignedProviderUserId !== currentUserId &&
            job.visibility === "public" &&
            job.status === "posted"
        ),
    [jobs, currentUserId]
  );
  const selectedOwnJob = useMemo(
    () => jobs.find((job) => job.id === selectedOwnJobId) ?? null,
    [jobs, selectedOwnJobId]
  );
  const personName = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return "Not assigned yet";
      return profilesByUserId[userId]?.displayName || `Member ${userId}`;
    },
    [profilesByUserId]
  );
  const personMeta = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return "No provider has been assigned yet.";
      const profile = profilesByUserId[userId];
      if (!profile) return `Member ID: ${userId}`;
      return [
        [profile.city, profile.area].filter(Boolean).join(", "),
        profile.serviceCategories.slice(0, 2).join(", "),
        `Member ID: ${profile.userId}`
      ].filter(Boolean).join(" · ");
    },
    [profilesByUserId]
  );
  const showPostedSection = section === "posted";
  const showAssignedSection = section === "assigned";
  const showDiscoverSection = section === "discover";
  const headerCopy = useMemo(() => {
    if (showPostedSection) {
      return {
        eyebrow: "Jobs",
        title: "Posted by me",
        subtitle: "Post jobs, review applicants, and manage your bookings."
      };
    }
    if (showAssignedSection) {
      return {
        eyebrow: "Jobs",
        title: "Assigned to me",
        subtitle: "See the jobs assigned to you and track their progress."
      };
    }
    return {
      eyebrow: "Jobs",
      title: "Discover work",
      subtitle: "Browse public jobs and jobs from your connections."
    };
  }, [showAssignedSection, showDiscoverSection, showPostedSection]);

  const loadOwnJobApplicantCounts = useCallback(
    async (jobRows: JobRecord[]): Promise<void> => {
      const ownJobs = jobRows.filter((job) => job.seekerUserId === currentUserId);
      if (ownJobs.length === 0) {
        setApplicantCountsByJob({});
        setApplicantCountsLoadingByJob({});
        return;
      }

      setApplicantCountsLoadingByJob(
        Object.fromEntries(ownJobs.map((job) => [job.id, true]))
      );
      const countEntries = await Promise.all(
        ownJobs.map(async (job) => {
          try {
            const rows = await listJobApplications(job.id, accessToken);
            return [job.id, rows.length] as const;
          } catch {
            return [job.id, 0] as const;
          }
        })
      );
      setApplicantCountsByJob(Object.fromEntries(countEntries));
      setApplicantCountsLoadingByJob(
        Object.fromEntries(ownJobs.map((job) => [job.id, false]))
      );
    },
    [accessToken, currentUserId]
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [jobRows, myApplicationRows] = await Promise.all([
        listJobsPage(accessToken),
        listMyJobApplications(accessToken)
      ]);
      setJobs(jobRows.items);
      setNextCursor(jobRows.nextCursor);
      setMyApplicationsByJob(latestApplicationByJob(myApplicationRows));
      const mediaEntries = await Promise.all(
        jobRows.items.map(async (job) => {
          try {
            const page = await listJobMediaPage(job.id, accessToken);
            return [job.id, page.items.filter((asset) => asset.purpose === "job")] as const;
          } catch {
            return [job.id, []] as const;
          }
        })
      );
      setJobMediaByJobId(Object.fromEntries(mediaEntries));
      await loadOwnJobApplicantCounts(jobRows.items);
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t load jobs. Refresh the list to try again.");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadOwnJobApplicantCounts, onSessionInvalid]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listJobsPage(accessToken, nextCursor);
      setJobs((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
      const mediaEntries = await Promise.all(
        page.items.map(async (job) => {
          try {
            const mediaPage = await listJobMediaPage(job.id, accessToken);
            return [job.id, mediaPage.items.filter((asset) => asset.purpose === "job")] as const;
          } catch {
            return [job.id, []] as const;
          }
        })
      );
      setJobMediaByJobId((previous) => ({ ...previous, ...Object.fromEntries(mediaEntries) }));
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t load more jobs. Try again.");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, nextCursor, onSessionInvalid]);

  const loadSelectedOwnJobApplications = useCallback(
    async (jobId: string): Promise<void> => {
      setSelectedOwnJobLoading(true);
      try {
        const rows = await listJobApplications(jobId, accessToken);
        setSelectedOwnJobApplications(
          rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );
        setApplicantCountsByJob((previous) => ({ ...previous, [jobId]: rows.length }));
        setApplicantCountsLoadingByJob((previous) => ({ ...previous, [jobId]: false }));
      } catch (requestError) {
        const message = asError(requestError, "Couldn’t load applicants. Refresh the job to try again.");
        setJobActionError(message);
        if (shouldForceSignOut(message)) {
          onSessionInvalid();
        }
      } finally {
        setSelectedOwnJobLoading(false);
      }
    },
    [accessToken, onSessionInvalid]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ids = Array.from(
      new Set([
        ...jobs.flatMap((job) => [job.seekerUserId, job.assignedProviderUserId]),
        ...selectedOwnJobApplications.map((application) => application.providerUserId)
      ].filter((userId): userId is string => Boolean(userId)))
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
  }, [accessToken, jobs, profilesByUserId, selectedOwnJobApplications]);

  useEffect(() => {
    if (!selectedOwnJobId || !ownJobManagerVisible) {
      setSelectedOwnJobApplications([]);
      return;
    }
    void loadSelectedOwnJobApplications(selectedOwnJobId);
  }, [loadSelectedOwnJobApplications, ownJobManagerVisible, selectedOwnJobId]);

  useEffect(() => {
    if (!selectedOwnJobId) {
      return;
    }
    const stillExists = jobs.some((job) => job.id === selectedOwnJobId);
    if (!stillExists) {
      setSelectedOwnJobId(null);
      setSelectedOwnJobApplications([]);
      setSelectedApplicantProfile(null);
      setOwnJobManagerVisible(false);
    }
  }, [jobs, selectedOwnJobId]);

  const refreshOwnJobMedia = useCallback(async (jobId: string): Promise<void> => {
    setJobMediaLoading(true);
    setJobMediaLoadError(null);
    try {
      const [approved, owned] = await Promise.allSettled([
        listJobMediaPage(jobId, accessToken),
        listOwnJobMedia(jobId, accessToken)
      ]);
      if (approved.status === "fulfilled") {
        setJobMediaByJobId((previous) => ({ ...previous, [jobId]: approved.value.items }));
      }
      if (owned.status === "fulfilled") {
        setOwnMedia((previous) => [...previous.filter((asset) => asset.jobId !== jobId), ...owned.value]);
      }
      if (approved.status === "rejected" || owned.status === "rejected") {
        setJobMediaLoadError("Couldn’t refresh job media. Try refreshing again.");
      }
    } finally {
      setJobMediaLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (selectedOwnJobId && ownJobManagerVisible) void refreshOwnJobMedia(selectedOwnJobId);
  }, [selectedOwnJobId, ownJobManagerVisible, refreshOwnJobMedia]);

  const onCreate = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setPostedJob(null);

    const payload: CreateJobPayload = {
      category: latestDraftRef.current.category.trim(),
      title: latestDraftRef.current.title.trim(),
      description: latestDraftRef.current.description.trim(),
      locationText: latestDraftRef.current.locationText.trim(),
      visibility: latestDraftRef.current.visibility
    };

    const validationError = validateJobPayload(payload);
    if (validationError) {
      setSubmitError(validationError);
      setSubmitting(false);
      return;
    }

    try {
      const created = await createJob(payload, accessToken);
      setJobs((previous) => [created, ...previous]);
      setPostedJob(created);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      latestDraftRef.current = {
        category: "",
        title: "",
        description: "",
        locationText: "",
        visibility: "public"
      };
      setCategory("");
      setTitle("");
      setDescription("");
      setLocationText("");
      setVisibility("public");
      setSelectedApplicantProfile(null);
      setOwnJobManagerVisible(false);
      setApplicantCountsByJob((previous) => ({ ...previous, [created.id]: 0 }));
      setApplicantCountsLoadingByJob((previous) => ({ ...previous, [created.id]: false }));
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t post the job. Check the details and try again.");
      setSubmitError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const runJobAction = async (
    actionKey: string,
    action: () => Promise<void>,
    showError: (message: string) => void = setJobActionError
  ): Promise<void> => {
    if (jobActionLoadingId) return;
    setJobActionLoadingId(actionKey);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      await action();
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t update this job. Refresh the job and try again.");
      showError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const onApply = async (jobId: string): Promise<void> => {
    if (jobActionLoadingId) return;
    const validationError = validateApplicationMessage(applyMessage);
    setApplicationError(validationError);
    if (validationError) return;

    await runJobAction(`apply-${jobId}`, async () => {
      let created: JobApplicationRecord;
      try {
        created = await applyToJob(jobId, { message: applyMessage.trim() || undefined }, accessToken);
      } catch (requestError) {
        const message = asError(requestError, "Couldn’t send your application. Check that the job is still open and try again.");
        setApplicationError(message);
        if (shouldForceSignOut(message)) onSessionInvalid();
        return;
      }
      setMyApplicationsByJob((previous) => ({ ...previous, [jobId]: created }));
      setApplyMessage("");
      setApplyingJobId(null);
      setJobActionSuccess("Application submitted.");
    });
  };

  const onWithdraw = async (application: JobApplicationRecord): Promise<void> => {
    await runJobAction(`withdraw-${application.id}`, async () => {
      const updated = await withdrawJobApplication(application.id, accessToken);
      setMyApplicationsByJob((previous) => ({ ...previous, [application.jobId]: updated }));
      setJobActionSuccess("Application withdrawn.");
    });
  };

  const openJobManager = (jobId: string): void => {
    setSelectedOwnJobId(jobId);
    setSelectedOwnJobApplications([]);
    setSelectedOwnJobLoading(true);
    setSelectedApplicantProfile(null);
    setApplyingJobId(null);
    setAssigningId(null);
    setAssignmentError(null);
    setDecisionReason("");
    setBookingDecision(null);
    setBookingNotice(null);
    setPickedJobMediaFiles([]);
    setJobMediaError(null);
    setJobMediaSuccess(null);
    setOwnJobManagerVisible(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const onAcceptApplicant = async (application: JobApplicationRecord): Promise<void> => {
    if (selectedOwnJob?.status !== "posted" || application.jobId !== selectedOwnJob.id ||
        assigningId !== application.id || !isPendingJobApplicationStatus(application.status)) return;
    setAssignmentError(null);
    await runJobAction(`accept-${application.id}`, async () => {
      const accepted = await acceptJobApplication(application.id, accessToken);
      setJobs((previous) => previous.map((job) => job.id === accepted.jobId
        ? { ...job, status: "accepted", assignedProviderUserId: accepted.providerUserId }
        : job));
      setSelectedOwnJobApplications((previous) => previous.map((item) => item.id === accepted.id ? accepted : item));
      setAssigningId(null);
      await load();
      await loadSelectedOwnJobApplications(accepted.jobId);
      setJobActionSuccess("Job assigned.");
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, setAssignmentError);
  };

  const onRejectApplicant = async (applicationId: string): Promise<void> => {
    await runJobAction(`reject-${applicationId}`, async () => {
      await rejectJobApplication(
        applicationId,
        { reason: decisionReason.trim() || undefined },
        accessToken
      );
      await load();
      if (selectedOwnJobId) {
        await loadSelectedOwnJobApplications(selectedOwnJobId);
      }
      setDecisionReason("");
      setJobActionSuccess("Applicant rejected.");
    });
  };

  const onViewApplicantProfile = async (providerUserId: string): Promise<void> => {
    await runJobAction(`applicant-profile-${providerUserId}`, async () => {
      const profile = await getProfileByUserId(providerUserId, accessToken);
      setProfilesByUserId((previous) => ({ ...previous, [providerUserId]: profile }));
      setSelectedApplicantProfile(profile);
      setJobActionSuccess("Applicant profile loaded.");
    });
  };

  const onUpdateJobStatus = async (job: JobRecord, action: BookingAction): Promise<void> => {
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
    setBookingNotice(null);
    await runJobAction(`${action}-${job.id}`, async () => {
      const updated = await operations[action]();
      setJobs((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setBookingDecision(null);
      setBookingReason("");
      setBookingNotice({ jobId: job.id, tone: "success", message: bookingActions[action].success });
      if (job.id === selectedOwnJobId && (action === "revoke" || action === "cancel")) {
        await loadSelectedOwnJobApplications(job.id);
      } else if (action === "cancel" && job.assignedProviderUserId === currentUserId) {
        setMyApplicationsByJob((previous) => {
          const application = previous[job.id];
          return application?.status === "accepted"
            ? { ...previous, [job.id]: { ...application, status: "withdrawn" } }
            : previous;
        });
      }
    }, (message) => setBookingNotice({ jobId: job.id, tone: "error", message }));
  };

  const renderBooking = (job: JobRecord, role: "owner" | "provider"): JSX.Element => {
    const booking = bookingControls(job.status, role);
    const decision = bookingDecision?.jobId === job.id &&
      ((bookingDecision.action === "cancel" && booking.canCancel) ||
        (bookingDecision.action === "revoke" && booking.canRevoke)) ? bookingDecision.action : null;
    const notice = bookingNotice?.jobId === job.id ? bookingNotice : null;
    const review = (action: "cancel" | "revoke" | null): void => {
      setBookingDecision(action ? { jobId: job.id, action } : null);
      setBookingReason("");
      setBookingNotice(null);
    };
    const primary = booking.primary;

    return (
      <CardSurface variant="action" testID={`jobs-booking-${job.id}`}>
        <Text style={styles.cardTitle} accessibilityRole="header">Booking</Text>
        <Text style={styles.dataTitle}>{booking.label}</Text>
        <Text style={styles.cardBodyMuted}>{booking.next}</Text>
        {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
        {decision ? (
          <>
            <Text style={styles.dataTitle}>{bookingConfirmation[decision].prompt}</Text>
            <InputField
              label={bookingConfirmation[decision].reason}
              value={bookingReason}
              onChangeText={setBookingReason}
              multiline
              testID={`jobs-${decision}-reason`}
            />
            <AppButton
              label={jobActionLoadingId ? "Updating…" : bookingActions[decision].label}
              disabled={!!jobActionLoadingId}
              onPress={() => void onUpdateJobStatus(job, decision)}
              testID={decision === "revoke" ? `jobs-revoke-assignment-${job.id}` : `jobs-cancel-${job.id}`}
            />
            <AppButton label="Keep booking" variant="ghost" disabled={!!jobActionLoadingId} onPress={() => review(null)} testID="jobs-keep-booking" />
          </>
        ) : (
          <>
            {primary ? (
              <AppButton
                label={jobActionLoadingId === `${primary}-${job.id}` ? "Updating…" : bookingActions[primary].label}
                disabled={!!jobActionLoadingId}
                onPress={() => void onUpdateJobStatus(job, primary)}
                testID={`jobs-${primary}-${job.id}`}
              />
            ) : null}
            {booking.canRevoke ? <AppButton label="Review revocation" variant="secondary" disabled={!!jobActionLoadingId} onPress={() => review("revoke")} testID={`jobs-review-revoke-${job.id}`} /> : null}
            {booking.canCancel ? <AppButton label="Review cancellation" variant="ghost" disabled={!!jobActionLoadingId} onPress={() => review("cancel")} testID={`jobs-review-cancel-${job.id}`} /> : null}
          </>
        )}
      </CardSurface>
    );
  };

  const onPickJobMedia = async (): Promise<void> => {
    setJobMediaError(null);
    setJobMediaSuccess(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: true,
      copyToCacheDirectory: true
    });
    if (result.canceled) {
      return;
    }
    const files: PickedMediaFile[] = [];
    for (const asset of result.assets) {
      if (!asset?.mimeType || !asset.size) {
        setJobMediaError("Choose images or videos with readable file sizes.");
        return;
      }
      if (!inferMediaKind(asset.mimeType)) {
        setJobMediaError("Only job photos and videos are supported.");
        return;
      }
      files.push({
        uri: asset.uri,
        name: asset.name || `job-media-${Date.now()}`,
        mimeType: asset.mimeType,
        size: asset.size
      });
    }
    setPickedJobMediaFiles((previous) => [...previous, ...files]);
  };

  const onCaptureJobMedia = async (): Promise<void> => {
    setJobMediaError(null);
    setJobMediaSuccess(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setJobMediaError("Allow camera access in Settings, or choose a file from this device.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: 60
    });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
    const size = asset.fileSize ?? 0;
    if (!size) {
      setJobMediaError("Choose an image or video with a readable file size.");
      return;
    }
    if (!inferMediaKind(mimeType)) {
      setJobMediaError("Only job photos and videos are supported.");
      return;
    }
    setPickedJobMediaFiles((previous) => [...previous, {
      uri: asset.uri,
      name: asset.fileName || `job-media-${Date.now()}`,
      mimeType,
      size
    }]);
  };

  const onUploadPickedJobMedia = async (jobId: string): Promise<void> => {
    if (jobMediaUploading) return;
    if (pickedJobMediaFiles.length === 0) {
      setJobMediaError("Choose one or more job photos or videos first.");
      return;
    }
    const invalidFile = pickedJobMediaFiles.find((file) => !inferMediaKind(file.mimeType));
    if (invalidFile) {
      setJobMediaError(`Only job photos and videos are supported. Remove ${invalidFile.name}.`);
      return;
    }
    setJobMediaUploading(true);
    setJobMediaError(null);
    setJobMediaSuccess(null);
    let uploadedCount = 0;
    try {
      for (const file of pickedJobMediaFiles) {
        const kind = inferMediaKind(file.mimeType);
        if (!kind) continue;
        const ticket = await createMediaUploadTicket(
          {
            kind,
            purpose: "job",
            jobId,
            contentType: file.mimeType,
            fileSizeBytes: file.size,
            checksumSha256: await mediaChecksum(file.uri),
            originalFileName: file.name
          },
          accessToken
        );
        const uploadResponse = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: ticket.requiredHeaders,
          body: {
            uri: file.uri,
            name: file.name,
            type: file.mimeType
          } as unknown as RequestInit["body"]
        });
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }
        const etag = uploadResponse.headers.get("etag")?.replace(/"/g, "");
        const uploaded = await completeMediaUpload(ticket.mediaId, { etag: etag || undefined }, accessToken);
        setOwnMedia((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
        uploadedCount += 1;
        setPickedJobMediaFiles((previous) => previous.slice(1));
      }
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t upload the remaining files. Try uploading them again.");
      setJobMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      if (uploadedCount) setJobMediaSuccess(`${uploadedCount} job ${uploadedCount === 1 ? "file" : "files"} uploaded for review.`);
      setJobMediaUploading(false);
    }
  };

  const renderExternalJobs = (rows: JobRecord[], compact = false): JSX.Element => {
    if (!loading && rows.length === 0) {
      return <Text style={styles.cardBodyMuted}>No jobs here yet.</Text>;
    }

    return (
      <View style={styles.stackSmall}>
        {rows.map((job) => {
          const application = myApplicationsByJob[job.id] ?? null;
          const canApply =
            job.status === "posted" &&
            (!application ||
              application.status === "withdrawn" ||
              application.status === "rejected");
          const canWithdraw =
            job.status === "posted" &&
            !!application &&
            isPendingJobApplicationStatus(application.status);
          const isAssignedProvider = job.assignedProviderUserId === currentUserId;
          const detailsOpen = !compact || openDiscoverJobId === job.id;

          return (
            <CardSurface key={job.id} variant="record">
              <Text style={styles.dataTitle}>{job.title}</Text>
              <Text style={styles.dataMeta}>
                {job.category} · {job.locationText}
              </Text>
              <Text style={styles.dataMeta}>
                Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
              </Text>
              <StatusLabel label={job.status.replaceAll("_", " ")} />
              {application ? (
                <Text style={styles.dataMeta}>
                  {canWithdraw ? "Application submitted" : `Your application: ${application.status}`}
                </Text>
              ) : null}
              {compact ? (
                <AppButton
                  label={detailsOpen ? "Hide job details" : "View job details"}
                  variant="secondary"
                  expanded={detailsOpen}
                  disabled={!!jobActionLoadingId}
                  onPress={() => {
                    setOpenDiscoverJobId(detailsOpen ? null : job.id);
                    setApplyingJobId(null);
                    setApplyMessage("");
                    setApplicationError(null);
                  }}
                  testID={`jobs-details-${job.id}`}
                />
              ) : null}
              {detailsOpen ? (
                <>
                  <Text style={styles.dataMeta}>Posted by: {personName(job.seekerUserId)}</Text>
                  <Text style={styles.dataMeta}>{personMeta(job.seekerUserId)}</Text>
                  <Text style={styles.dataMeta}>{job.description}</Text>
                  <Text style={styles.dataMeta}>Posted: {formatDate(job.createdAt)}</Text>
                  {canApply && applyingJobId === job.id ? (
                    <View style={styles.stackSmall}>
                      <InputField
                        label="Message to the job poster (optional)"
                        value={applyMessage}
                        onChangeText={(message) => { setApplyMessage(message); setApplicationError(null); }}
                        multiline
                        testID="jobs-apply-message"
                      />
                      <Text style={styles.dataMeta}>{applicationMessageHint}</Text>
                      {applicationError ? <Banner tone="error" message={applicationError} testID="jobs-application-error" /> : null}
                      <AppButton
                        label={jobActionLoadingId === `apply-${job.id}` ? "Applying..." : "Submit application"}
                        onPress={() => void onApply(job.id)}
                        disabled={!!jobActionLoadingId}
                        testID={`jobs-apply-submit-${job.id}`}
                      />
                      <AppButton label="Cancel application" variant="ghost" disabled={!!jobActionLoadingId} onPress={() => setApplyingJobId(null)} />
                    </View>
                  ) : canApply ? (
                    <AppButton
                      label="Apply for job"
                      disabled={!!jobActionLoadingId}
                      onPress={() => {
                        setApplyMessage("");
                        setApplicationError(null);
                        setApplyingJobId(job.id);
                      }}
                      testID={`jobs-apply-${job.id}`}
                    />
                  ) : null}
                  {canWithdraw && application ? (
                    <AppButton
                      label={
                        jobActionLoadingId === `withdraw-${application.id}`
                          ? "Removing..."
                          : "Withdraw application"
                      }
                      onPress={() => {
                        void onWithdraw(application);
                      }}
                      variant="secondary"
                      disabled={jobActionLoadingId === `withdraw-${application.id}`}
                      testID={`jobs-withdraw-${application.id}`}
                    />
                  ) : null}
                  {isAssignedProvider ? renderBooking(job, "provider") : null}
                  <MediaPreviewList
                    items={approvedMedia(jobMediaByJobId[job.id] ?? [])}
                    emptyText="No approved job media yet."
                    deferVideo
                    testID={`jobs-media-${job.id}`}
                  />
                </>
              ) : null}
            </CardSurface>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.screenScroll}
      testID="jobs-scroll"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>{headerCopy.eyebrow}</Text>
        <Text style={styles.screenTitle}>{headerCopy.title}</Text>
        <Text style={styles.screenSubtitle}>{headerCopy.subtitle}</Text>
      </View>
      {error ? <Banner tone="error" message={error} testID="jobs-error-banner" /> : null}
      {postedJob && !ownJobManagerVisible ? (
        <CardSurface variant="action">
          <Banner tone="success" message="Job posted." testID="jobs-success-banner" />
          <Text style={styles.dataTitle}>{postedJob.title}</Text>
          <AppButton label="Review applicants" variant="secondary" onPress={() => openJobManager(postedJob.id)} testID="jobs-posted-review" />
        </CardSurface>
      ) : null}
      {jobActionError ? (
        <Banner tone="error" message={jobActionError} testID="jobs-action-error-banner" />
      ) : null}
      {jobActionSuccess ? (
        <Banner tone="success" message={jobActionSuccess} testID="jobs-action-success-banner" />
      ) : null}

      {!ownJobManagerVisible ? (
        <>
          {showPostedSection ? (
            <>
              <SectionCard title="Create job">
                {submitError ? <Banner tone="error" message={submitError} testID="jobs-submit-error-banner" /> : null}
                <InputField
                  label="Category"
                  value={category}
                  onChangeText={(value) => {
                    latestDraftRef.current.category = value;
                    setCategory(value);
                  }}
                  placeholder="plumber"
                  testID="jobs-category"
                />
                <InputField
                  label="Title"
                  value={title}
                  onChangeText={(value) => {
                    latestDraftRef.current.title = value;
                    setTitle(value);
                  }}
                  placeholder="Kitchen sink leakage repair"
                  testID="jobs-title"
                />
                <InputField
                  label="Description"
                  value={description}
                  onChangeText={(value) => {
                    latestDraftRef.current.description = value;
                    setDescription(value);
                  }}
                  placeholder="Describe the work you need done."
                  multiline
                  testID="jobs-description"
                />
                <InputField
                  label="Location"
                  value={locationText}
                  onChangeText={(value) => {
                    latestDraftRef.current.locationText = value;
                    setLocationText(value);
                  }}
                  placeholder="Kakkanad, Kochi"
                  testID="jobs-location"
                />
                <Text style={styles.fieldLabel}>Visibility</Text>
                <View style={styles.roleRow}>
                  <Pressable
                    style={[styles.roleChip, visibility === "public" ? styles.roleChipSelected : null]}
                    onPress={() => {
                      latestDraftRef.current.visibility = "public";
                      setVisibility("public");
                    }}
                    testID="jobs-visibility-public"
                    accessibilityRole="radio"
                    accessibilityLabel="Make job visible to everyone"
                    accessibilityState={{ selected: visibility === "public" }}
                  >
                    <Text
                      style={[
                        styles.roleChipLabel,
                        visibility === "public" ? styles.roleChipLabelSelected : null
                      ]}
                    >
                      Public
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.roleChip,
                      visibility === "connections_only" ? styles.roleChipSelected : null
                    ]}
                    onPress={() => {
                      latestDraftRef.current.visibility = "connections_only";
                      setVisibility("connections_only");
                    }}
                    testID="jobs-visibility-connections"
                    accessibilityRole="radio"
                    accessibilityLabel="Make job visible to connections only"
                    accessibilityState={{ selected: visibility === "connections_only" }}
                  >
                    <Text
                      style={[
                        styles.roleChipLabel,
                        visibility === "connections_only" ? styles.roleChipLabelSelected : null
                      ]}
                    >
                      Connections only
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.cardBodyMuted}>
                  {visibility === "public" ? "Members can find this job." : "Only accepted connections can find this job."}
                </Text>
                <AppButton
                  label={submitting ? "Posting..." : "Post job"}
                  onPress={() => {
                    void onCreate();
                  }}
                  disabled={submitting}
                  testID="jobs-submit"
                />
              </SectionCard>

              <View style={styles.stackSmall}>
                <Text accessibilityRole="header" style={styles.cardTitle}>Jobs posted by me</Text>
                {loading ? <Text style={styles.cardBodyMuted}>Loading jobs...</Text> : null}
                {!loading && jobsPostedByMe.length === 0 ? (
                  <Text style={styles.cardBodyMuted}>You have not posted any jobs yet.</Text>
                ) : null}
                <View style={styles.stackSmall}>
                  {jobsPostedByMe.map((job) => {
                    const isCountLoading = applicantCountsLoadingByJob[job.id] ?? true;
                    const applicantCount = isCountLoading ? null : applicantCountsByJob[job.id] ?? 0;
                    const noApplicants = applicantCount === 0;
                    return (
                      <CardSurface key={job.id} variant="record">
                        <Text style={styles.dataTitle}>{job.title}</Text>
                        <Text style={styles.dataMeta}>
                          {job.category} · {job.locationText}
                        </Text>
                        <Text style={styles.dataMeta}>
                          Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
                        </Text>
                        <Text style={styles.dataMeta}>Status: {job.status}</Text>
                        <Text style={styles.dataMeta}>
                          Assigned provider: {personName(job.assignedProviderUserId)}
                        </Text>
                        <Text style={styles.dataMeta}>
                          Applicants: {applicantCount ?? "..."}
                        </Text>
                        <Text style={styles.dataMeta}>Created: {formatDate(job.createdAt)}</Text>
                        <MediaPreviewList
                          items={approvedMedia(jobMediaByJobId[job.id] ?? [])}
                          emptyText="No approved job media yet."
                          deferVideo
                          testID={`jobs-posted-media-${job.id}`}
                        />
                        {isCountLoading ? (
                          <Text style={styles.dataMeta}>Loading applicants...</Text>
                        ) : null}
                        {!isCountLoading && noApplicants ? (
                          <Text style={styles.dataMeta} testID={`jobs-no-applicants-${job.id}`}>
                            No applicants
                          </Text>
                        ) : null}
                        <AppButton
                          label={
                            job.assignedProviderUserId || noApplicants ? "Manage job" : "Review applicants"
                          }
                          onPress={() => openJobManager(job.id)}
                          variant="secondary"
                          testID={`jobs-manage-${job.id}`}
                        />
                      </CardSurface>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {showAssignedSection ? (
            <View style={styles.stackSmall}>
                <Text accessibilityRole="header" style={styles.cardTitle}>Jobs assigned to me</Text>
                {renderExternalJobs(jobsAssignedToMe)}
              </View>
          ) : null}

          {showDiscoverSection ? (
            <>
              <View style={styles.stackSmall}>
                <Text accessibilityRole="header" style={styles.cardTitle}>Jobs from connected people</Text>
                {renderExternalJobs(jobsFromConnectedPeople, true)}
              </View>

              <View style={styles.stackSmall}>
                <Text accessibilityRole="header" style={styles.cardTitle}>Public jobs</Text>
                {renderExternalJobs(publicJobs, true)}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {selectedOwnJob && ownJobManagerVisible ? (
        <SectionCard
          variant="action"
          title={`Manage job: ${selectedOwnJob.title}`}
          subtitle={`Status: ${selectedOwnJob.status}`}
        >
          <AppButton
            label="Back to jobs list"
            onPress={() => {
              setOwnJobManagerVisible(false);
              scrollRef.current?.scrollTo({ y: 0, animated: false });
            }}
            variant="ghost"
            disabled={jobMediaUploading || !!jobActionLoadingId}
            testID="jobs-manage-back"
          />
          {selectedOwnJob.status !== "posted" ? renderBooking(selectedOwnJob, "owner") : null}
          <Text style={styles.cardTitle} accessibilityRole="header">Applicants</Text>
          {selectedOwnJob.assignedProviderUserId ? (
            <Text style={styles.dataTitle} testID="jobs-assigned-provider">
              Assigned to {personName(selectedOwnJob.assignedProviderUserId)}
            </Text>
          ) : null}
          {selectedOwnJobLoading ? <Text style={styles.cardBodyMuted}>Loading applicants...</Text> : null}
          {!selectedOwnJobLoading && managerApplications.length === 0 ? (
            <Text style={styles.cardBodyMuted} testID="jobs-applicants-empty">
              No applicants yet.
            </Text>
          ) : null}
          <View style={styles.stackSmall}>
            {managerApplications.map((application) => (
              <View key={application.id} style={styles.dataRow}>
                <Text style={styles.dataTitle}>{personName(application.providerUserId)}</Text>
                <Text style={styles.dataMeta}>{personMeta(application.providerUserId)}</Text>
                <Text style={styles.dataMeta}>Status: {application.status}</Text>
                <Text style={styles.dataMeta}>
                  Applied: {formatDate(application.createdAt)}
                </Text>
                {application.message ? (
                  <Text style={styles.dataMeta}>Message: {application.message}</Text>
                ) : null}
                <AppButton
                  label={
                    jobActionLoadingId === `applicant-profile-${application.providerUserId}`
                      ? "Loading profile..."
                      : "View profile"
                  }
                  onPress={() => {
                    void onViewApplicantProfile(application.providerUserId);
                  }}
                  variant="ghost"
                  disabled={jobActionLoadingId === `applicant-profile-${application.providerUserId}`}
                  testID={`jobs-applicant-profile-${application.id}`}
                />
                {selectedApplicantProfile?.userId === application.providerUserId ? (
                  <View style={styles.stackSmall}>
                    <Text accessibilityRole="header" style={styles.dataTitle}>Applicant profile preview</Text>
                    <Text style={styles.dataTitle}>{selectedApplicantProfile.displayName}</Text>
                    <Text style={styles.dataMeta}>Member ID: {selectedApplicantProfile.userId}</Text>
                    <Text style={styles.dataMeta}>
                      Location: {[selectedApplicantProfile.city, selectedApplicantProfile.area].filter(Boolean).join(", ") || "Not provided"}
                    </Text>
                    <Text style={styles.dataMeta}>
                      Services: {selectedApplicantProfile.serviceCategories.join(", ") || "Not provided"}
                    </Text>
                    <Text style={styles.dataMeta}>
                      Phone: {selectedApplicantProfile.visibility.phone
                        ? selectedApplicantProfile.contact.phone ?? "Not provided"
                        : selectedApplicantProfile.contact.phoneMasked ?? "Hidden"}
                    </Text>
                  </View>
                ) : null}
                {selectedOwnJob.status === "posted" && isPendingJobApplicationStatus(application.status) && assigningId !== application.id ? (
                  <>
                    <AppButton
                      label="Review assignment"
                      onPress={() => {
                        setAssigningId(application.id);
                        setAssignmentError(null);
                      }}
                      disabled={!!jobActionLoadingId}
                      testID={`jobs-applicant-review-${application.id}`}
                    />
                    <AppButton
                      label={
                        jobActionLoadingId === `reject-${application.id}`
                          ? "Rejecting..."
                          : "Reject applicant"
                      }
                      onPress={() => {
                        void onRejectApplicant(application.id);
                      }}
                      variant="secondary"
                      disabled={jobActionLoadingId === `reject-${application.id}`}
                      testID={`jobs-applicant-reject-${application.id}`}
                    />
                  </>
                ) : null}
                {selectedOwnJob.status === "posted" && isPendingJobApplicationStatus(application.status) && assigningId === application.id ? (
                  <View style={styles.stackSmall}>
                    <Text style={styles.cardBody}>Assign this job to {personName(application.providerUserId)}? Other pending applications for this job will close.</Text>
                    {assignmentError ? <Banner tone="error" message={assignmentError} /> : null}
                    <AppButton
                      label={jobActionLoadingId === `accept-${application.id}` ? "Assigning..." : "Assign job"}
                      onPress={() => void onAcceptApplicant(application)}
                      disabled={!!jobActionLoadingId}
                      testID={`jobs-applicant-accept-${application.id}`}
                    />
                    <AppButton label="Keep reviewing" variant="ghost" disabled={!!jobActionLoadingId} onPress={() => setAssigningId(null)} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <InputField
            label="Decision reason (optional)"
            value={decisionReason}
            onChangeText={setDecisionReason}
            placeholder="You can add a reason for the record."
            multiline
            testID="jobs-decision-reason"
          />
          {selectedOwnJob.status === "posted" ? renderBooking(selectedOwnJob, "owner") : null}
          <CardSurface variant="action">
            <MediaUploadPanel
              title="Job photos and videos"
              description="Add photos or videos of the work. Only people who can view this job can see them after approval."
              pickLabel="Choose job photos or videos"
              cameraLabel="Take a job photo or video"
              uploadLabel="Upload for review"
              pickedFiles={pickedJobMediaFiles}
              pendingItems={pendingReviewMedia(ownMedia.filter((asset) => asset.jobId === selectedOwnJob.id && asset.state !== "uploaded"))}
              rejectedItems={ownMedia.filter((asset) => asset.jobId === selectedOwnJob.id && asset.state === "rejected")}
              onRequestReview={async (mediaId) => {
                if (!accessToken) throw new Error("Sign in to request a review.");
                const updated = await requestMediaReview(mediaId, accessToken);
                setOwnMedia((previous) => previous.map((asset) => asset.id === updated.id ? updated : asset));
              }}
              uploading={jobMediaUploading}
              error={jobMediaError}
              success={jobMediaSuccess}
              testID={`jobs-upload-media-${selectedOwnJob.id}`}
              onPick={() => void onPickJobMedia()}
              onCameraPick={() => void onCaptureJobMedia()}
              onClear={() => setPickedJobMediaFiles([])}
              onRemove={(index) => setPickedJobMediaFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
              onUpload={() => void onUploadPickedJobMedia(selectedOwnJob.id)}
            />
            {jobMediaLoadError ? <Banner tone="error" message={jobMediaLoadError} /> : null}
            <Text style={styles.cardTitle} accessibilityRole="header">Approved media</Text>
            <MediaPreviewList
              items={approvedMedia(jobMediaByJobId[selectedOwnJob.id] ?? [])}
              emptyText={jobMediaLoading ? "Loading job media…" : "No approved job photos or videos yet."}
              testID={`jobs-selected-media-${selectedOwnJob.id}`}
              deferVideo
            />
            <AppButton
              label={jobMediaLoading ? "Refreshing media…" : "Refresh job media"}
              variant="secondary"
              disabled={jobMediaLoading || jobMediaUploading}
              onPress={() => void refreshOwnJobMedia(selectedOwnJob.id)}
              testID="jobs-refresh-media"
            />
          </CardSurface>
        </SectionCard>
      ) : null}

      {nextCursor ? (
        <AppButton
          label={loading ? "Loading jobs" : "Load more jobs"}
          onPress={() => {
            void loadMore();
          }}
          variant="secondary"
          disabled={loading}
          testID="jobs-load-more"
        />
      ) : null}

      <AppButton
        label={loading ? "Refreshing..." : "Refresh jobs"}
        onPress={() => {
          void load();
          if (selectedOwnJobId) {
            void loadSelectedOwnJobApplications(selectedOwnJobId);
          }
        }}
        variant="ghost"
        disabled={loading}
        testID="jobs-refresh"
      />
    </ScrollView>
  );
}
