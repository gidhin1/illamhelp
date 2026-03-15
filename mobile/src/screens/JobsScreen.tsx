
import {
  acceptJobApplication, applyToJob,
  AuthenticatedUser, cancelBooking, closeBooking, completeBooking,
  createJob, formatDate, getProfileByUserId, getServiceCatalog, JobApplicationRecord, JobRecord, listJobApplications, listJobs, listMyJobApplications,
  markPaymentDone,
  markPaymentReceived, ProfileRecord, rejectJobApplication,
  revokeJobAssignment,
  ServiceCatalogOption,
  startBooking, withdrawJobApplication
} from "../api";

import {
  validateJobPayload, shouldForceSignOut, asError, CreateJobPayload
} from "../utils";

import {
  MAX_RENDER_ROWS
} from "../constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { FALLBACK_SERVICE_CATALOG } from "../service-catalog";

function isPendingJobApplicationStatus(status: JobApplicationRecord["status"]): boolean {
  return status === "applied" || status === "shortlisted";
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
  const currentUserId = user.publicUserId;
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalogOption[]>(FALLBACK_SERVICE_CATALOG);
  const [myApplicationsByJob, setMyApplicationsByJob] = useState<
    Record<string, JobApplicationRecord>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryValue, setCategoryValue] = useState(FALLBACK_SERVICE_CATALOG[0]?.value ?? "plumbing");
  const [customCategory, setCustomCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "connections_only">("public");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<string | null>(null);
  const [jobActionSuccess, setJobActionSuccess] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [applicantCountsByJob, setApplicantCountsByJob] = useState<Record<string, number>>({});
  const [applicantCountsLoadingByJob, setApplicantCountsLoadingByJob] = useState<
    Record<string, boolean>
  >({});
  const [ownJobManagerVisible, setOwnJobManagerVisible] = useState(false);

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

  const jobsPostedByMe = useMemo(
    () => jobs.filter((job) => job.seekerUserId === currentUserId).slice(0, MAX_RENDER_ROWS),
    [jobs, currentUserId]
  );
  const jobsAssignedToMe = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            job.assignedProviderUserId === currentUserId && job.seekerUserId !== currentUserId
        )
        .slice(0, MAX_RENDER_ROWS),
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
        )
        .slice(0, MAX_RENDER_ROWS),
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
        )
        .slice(0, MAX_RENDER_ROWS),
    [jobs, currentUserId]
  );
  const selectedOwnJob = useMemo(
    () => jobs.find((job) => job.id === selectedOwnJobId) ?? null,
    [jobs, selectedOwnJobId]
  );
  const showPostedSection = section === "posted";
  const showAssignedSection = section === "assigned";
  const showDiscoverSection = section === "discover";
  const headerCopy = useMemo(() => {
    if (showPostedSection) {
      return {
        eyebrow: "Jobs",
        title: "Posted by me",
        subtitle: "Create jobs, review applicants, and manage assignments."
      };
    }
    if (showAssignedSection) {
      return {
        eyebrow: "Jobs",
        title: "Assigned to me",
        subtitle: "Track the jobs you are responsible for and continue each lifecycle."
      };
    }
    return {
      eyebrow: "Jobs",
      title: "Discover work",
      subtitle: "Explore public and trusted-network opportunities in one feed."
    };
  }, [showAssignedSection, showDiscoverSection, showPostedSection]);

  const selectedCatalogOption = useMemo(
    () => catalog.find((item) => item.value === categoryValue) ?? null,
    [catalog, categoryValue]
  );

  const resolvedCategory = useMemo(() => {
    if (!selectedCatalogOption || selectedCatalogOption.value === "other") {
      return customCategory.trim();
    }
    return selectedCatalogOption.label;
  }, [customCategory, selectedCatalogOption]);

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
        listJobs(accessToken),
        listMyJobApplications(accessToken)
      ]);
      setJobs(jobRows);
      setMyApplicationsByJob(latestApplicationByJob(myApplicationRows));
      await loadOwnJobApplicantCounts(jobRows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load jobs");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadOwnJobApplicantCounts, onSessionInvalid]);

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
        const message = asError(requestError, "Unable to load applicants");
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
    let cancelled = false;
    const loadCatalog = async (): Promise<void> => {
      try {
        const response = await getServiceCatalog();
        if (!cancelled && response.options.length > 0) {
          setCatalog(response.options);
          setCategoryValue(response.options[0]?.value ?? "other");
        }
      } catch {
        // keep fallback catalog
      }
    };
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedOwnJobId) {
      setSelectedOwnJobApplications([]);
      return;
    }
    void loadSelectedOwnJobApplications(selectedOwnJobId);
  }, [loadSelectedOwnJobApplications, selectedOwnJobId]);

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

  const onCreate = async (): Promise<void> => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const payload: CreateJobPayload = {
      category: resolvedCategory,
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
      setSubmitSuccess("Job posted.");
      latestDraftRef.current = {
        category: "",
        title: "",
        description: "",
        locationText: "",
        visibility: "public"
      };
      setCategoryValue(catalog[0]?.value ?? "other");
      setCustomCategory("");
      setTitle("");
      setDescription("");
      setLocationText("");
      setVisibility("public");
      setSelectedOwnJobId(created.id);
      setSelectedApplicantProfile(null);
      setOwnJobManagerVisible(false);
      setApplicantCountsByJob((previous) => ({ ...previous, [created.id]: 0 }));
      setApplicantCountsLoadingByJob((previous) => ({ ...previous, [created.id]: false }));
    } catch (requestError) {
      const message = asError(requestError, "Unable to create job");
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
    action: () => Promise<void>
  ): Promise<void> => {
    setJobActionLoadingId(actionKey);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      await action();
    } catch (requestError) {
      const message = asError(requestError, "Action failed");
      setJobActionError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const onApply = async (jobId: string): Promise<void> => {
    await runJobAction(`apply-${jobId}`, async () => {
      const created = await applyToJob(
        jobId,
        { message: applyMessage.trim() || undefined },
        accessToken
      );
      setMyApplicationsByJob((previous) => ({ ...previous, [jobId]: created }));
      setApplyMessage("");
      setJobActionSuccess("Application submitted.");
    });
  };

  const onWithdraw = async (application: JobApplicationRecord): Promise<void> => {
    await runJobAction(`withdraw-${application.id}`, async () => {
      const updated = await withdrawJobApplication(application.id, accessToken);
      setMyApplicationsByJob((previous) => ({ ...previous, [application.jobId]: updated }));
      setJobActionSuccess("Pending application removed.");
    });
  };

  const onAcceptApplicant = async (applicationId: string): Promise<void> => {
    await runJobAction(`accept-${applicationId}`, async () => {
      await acceptJobApplication(applicationId, accessToken);
      await load();
      if (selectedOwnJobId) {
        await loadSelectedOwnJobApplications(selectedOwnJobId);
      }
      setJobActionSuccess("Applicant approved. Job assignment is active.");
    });
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
      setSelectedApplicantProfile(profile);
      setJobActionSuccess("Applicant profile loaded.");
    });
  };

  const onUpdateJobStatus = async (
    actionKey: string,
    update: () => Promise<JobRecord>,
    successMessage: string
  ): Promise<void> => {
    await runJobAction(actionKey, async () => {
      const updated = await update();
      setJobs((previous) => previous.map((job) => (job.id === updated.id ? updated : job)));
      await load();
      if (selectedOwnJobId) {
        await loadSelectedOwnJobApplications(selectedOwnJobId);
      }
      setJobActionSuccess(successMessage);
    });
  };

  const renderExternalJobs = (rows: JobRecord[]): JSX.Element => {
    if (!loading && rows.length === 0) {
      return <Text style={styles.cardBodyMuted}>No jobs in this section yet.</Text>;
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

          return (
            <View key={job.id} style={styles.dataRow}>
              <Text style={styles.dataTitle}>{job.title}</Text>
              <Text style={styles.dataMeta}>
                {job.category} · {job.locationText}
              </Text>
              <Text style={styles.dataMeta}>
                Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
              </Text>
              <Text style={styles.dataMeta}>Posted by: {job.seekerUserId}</Text>
              <Text style={styles.dataMeta}>Status: {job.status}</Text>
              <Text style={styles.dataMeta}>{job.description}</Text>
              <Text style={styles.dataMeta}>Created: {formatDate(job.createdAt)}</Text>
              {application ? (
                <Text style={styles.dataMeta}>Your application: {application.status}</Text>
              ) : null}
              {application?.skillSnapshot ? (
                <Text style={styles.dataMeta}>
                  Skill snapshot: {application.skillSnapshot.jobName} · {application.skillSnapshot.proficiency}
                </Text>
              ) : null}
              {canApply ? (
                <AppButton
                  label={jobActionLoadingId === `apply-${job.id}` ? "Applying..." : "Apply for job"}
                  onPress={() => {
                    void onApply(job.id);
                  }}
                  disabled={jobActionLoadingId === `apply-${job.id}`}
                  testID={`jobs-apply-${job.id}`}
                />
              ) : null}
              {canWithdraw && application ? (
                <AppButton
                  label={
                    jobActionLoadingId === `withdraw-${application.id}`
                      ? "Removing..."
                      : "Remove pending application"
                  }
                  onPress={() => {
                    void onWithdraw(application);
                  }}
                  variant="secondary"
                  disabled={jobActionLoadingId === `withdraw-${application.id}`}
                  testID={`jobs-withdraw-${application.id}`}
                />
              ) : null}
              {isAssignedProvider && job.status === "accepted" ? (
                <AppButton
                  label={jobActionLoadingId === `start-${job.id}` ? "Starting..." : "Start job"}
                  onPress={() => {
                    void onUpdateJobStatus(
                      `start-${job.id}`,
                      () => startBooking(job.id, accessToken),
                      "Job started."
                    );
                  }}
                  disabled={jobActionLoadingId === `start-${job.id}`}
                  testID={`jobs-start-${job.id}`}
                />
              ) : null}
              {isAssignedProvider && job.status === "payment_done" ? (
                <AppButton
                  label={
                    jobActionLoadingId === `payment-received-${job.id}`
                      ? "Updating..."
                      : "Mark payment received"
                  }
                  onPress={() => {
                    void onUpdateJobStatus(
                      `payment-received-${job.id}`,
                      () => markPaymentReceived(job.id, accessToken),
                      "Payment marked as received."
                    );
                  }}
                  disabled={jobActionLoadingId === `payment-received-${job.id}`}
                  testID={`jobs-payment-received-${job.id}`}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="jobs-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>{headerCopy.eyebrow}</Text>
        <Text style={styles.screenTitle}>{headerCopy.title}</Text>
        <Text style={styles.screenSubtitle}>{headerCopy.subtitle}</Text>
      </View>
      {error ? <Banner tone="error" message={error} testID="jobs-error-banner" /> : null}
      {submitError ? (
        <Banner tone="error" message={submitError} testID="jobs-submit-error-banner" />
      ) : null}
      {submitSuccess ? (
        <Banner tone="success" message={submitSuccess} testID="jobs-success-banner" />
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
                <Text style={styles.fieldLabel}>Service catalog</Text>
                <View style={styles.roleRow}>
                  {catalog.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.roleChip,
                        categoryValue === option.value ? styles.roleChipSelected : null
                      ]}
                      onPress={() => setCategoryValue(option.value)}
                      testID={`jobs-category-${option.value}`}
                    >
                      <Text
                        style={[
                          styles.roleChipLabel,
                          categoryValue === option.value ? styles.roleChipLabelSelected : null
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {selectedCatalogOption?.value === "other" ? (
                  <InputField
                    label="Custom job name"
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    placeholder="Tile polish, babysitting..."
                    testID="jobs-category-custom"
                  />
                ) : null}
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
                  placeholder="Need urgent service support."
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
                <AppButton
                  label={submitting ? "Posting..." : "Post job"}
                  onPress={() => {
                    latestDraftRef.current.category = resolvedCategory;
                    void onCreate();
                  }}
                  disabled={submitting}
                  testID="jobs-submit"
                />
              </SectionCard>

              <SectionCard title="Jobs posted by me">
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
                      <View key={job.id} style={styles.dataRow}>
                        <Text style={styles.dataTitle}>{job.title}</Text>
                        <Text style={styles.dataMeta}>
                          {job.category} · {job.locationText}
                        </Text>
                        <Text style={styles.dataMeta}>
                          Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
                        </Text>
                        <Text style={styles.dataMeta}>Status: {job.status}</Text>
                        <Text style={styles.dataMeta}>
                          Assigned provider: {job.assignedProviderUserId ?? "Not assigned"}
                        </Text>
                        <Text style={styles.dataMeta}>
                          Applicants: {applicantCount ?? "..."}
                        </Text>
                        <Text style={styles.dataMeta}>Created: {formatDate(job.createdAt)}</Text>
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
                            job.assignedProviderUserId ? "Manage job/applicant" : "Manage applicants"
                          }
                          onPress={() => {
                            setSelectedOwnJobId(job.id);
                            setSelectedApplicantProfile(null);
                            setOwnJobManagerVisible(true);
                          }}
                          variant="secondary"
                          disabled={isCountLoading || noApplicants}
                          testID={`jobs-manage-${job.id}`}
                        />
                      </View>
                    );
                  })}
                </View>
              </SectionCard>
            </>
          ) : null}

          {showAssignedSection ? (
            <SectionCard title="Jobs assigned to me">
              {renderExternalJobs(jobsAssignedToMe)}
            </SectionCard>
          ) : null}

          {showDiscoverSection ? (
            <>
              <SectionCard title="Application message (optional)">
                <InputField
                  label="Message"
                  value={applyMessage}
                  onChangeText={setApplyMessage}
                  placeholder="I can visit today and complete this job."
                  multiline
                  testID="jobs-apply-message"
                />
              </SectionCard>
              <SectionCard title="Jobs from connected people">
                {renderExternalJobs(jobsFromConnectedPeople)}
              </SectionCard>

              <SectionCard title="Public jobs">
                {renderExternalJobs(publicJobs)}
              </SectionCard>
            </>
          ) : null}
        </>
      ) : null}

      {selectedOwnJob && ownJobManagerVisible ? (
        <SectionCard
          title={`Manage job: ${selectedOwnJob.title}`}
          subtitle={`Status: ${selectedOwnJob.status}`}
        >
          <AppButton
            label="Back to jobs list"
            onPress={() => {
              setOwnJobManagerVisible(false);
            }}
            variant="ghost"
            testID="jobs-manage-back"
          />
          <InputField
            label="Decision reason (optional)"
            value={decisionReason}
            onChangeText={setDecisionReason}
            placeholder="Optional reason for approve/reject actions."
            multiline
            testID="jobs-decision-reason"
          />
          {selectedOwnJobLoading ? <Text style={styles.cardBodyMuted}>Loading applicants...</Text> : null}
          {!selectedOwnJobLoading && selectedOwnJobApplications.length === 0 ? (
            <Text style={styles.cardBodyMuted} testID="jobs-applicants-empty">
              No applicants yet.
            </Text>
          ) : null}
          <View style={styles.stackSmall}>
            {selectedOwnJobApplications.map((application) => (
              <View key={application.id} style={styles.dataRow}>
                <Text style={styles.dataTitle}>{application.providerUserId}</Text>
                <Text style={styles.dataMeta}>Status: {application.status}</Text>
                <Text style={styles.dataMeta}>
                  Applied: {formatDate(application.createdAt)}
                </Text>
                {application.message ? (
                  <Text style={styles.dataMeta}>Message: {application.message}</Text>
                ) : null}
                {application.skillSnapshot ? (
                  <Text style={styles.dataMeta}>
                    Skill snapshot: {application.skillSnapshot.jobName} · {application.skillSnapshot.proficiency}
                  </Text>
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
                {isPendingJobApplicationStatus(application.status) ? (
                  <>
                    <AppButton
                      label={
                        jobActionLoadingId === `accept-${application.id}`
                          ? "Approving..."
                          : "Approve applicant"
                      }
                      onPress={() => {
                        void onAcceptApplicant(application.id);
                      }}
                      disabled={jobActionLoadingId === `accept-${application.id}`}
                      testID={`jobs-applicant-accept-${application.id}`}
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
              </View>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Lifecycle actions</Text>
          {selectedOwnJob.status === "accepted" ? (
            <InputField
              label="Revoke reason (optional)"
              value={revokeReason}
              onChangeText={setRevokeReason}
              placeholder="Optional reason for revoking assignment."
              multiline
              testID="jobs-revoke-reason"
            />
          ) : null}
          {(selectedOwnJob.status === "posted" ||
            selectedOwnJob.status === "accepted" ||
            selectedOwnJob.status === "in_progress") ? (
            <InputField
              label="Cancel reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Optional reason for cancellation."
              multiline
              testID="jobs-cancel-reason"
            />
          ) : null}

          {selectedOwnJob.status === "accepted" ? (
            <AppButton
              label={
                jobActionLoadingId === `revoke-${selectedOwnJob.id}`
                  ? "Revoking..."
                  : "Revoke assignment"
              }
              onPress={() => {
                void onUpdateJobStatus(
                  `revoke-${selectedOwnJob.id}`,
                  () =>
                    revokeJobAssignment(
                      selectedOwnJob.id,
                      { reason: revokeReason.trim() || undefined },
                      accessToken
                    ),
                  "Assignment revoked."
                );
              }}
              variant="secondary"
              disabled={jobActionLoadingId === `revoke-${selectedOwnJob.id}`}
              testID={`jobs-revoke-assignment-${selectedOwnJob.id}`}
            />
          ) : null}
          {selectedOwnJob.status === "in_progress" ? (
            <AppButton
              label={
                jobActionLoadingId === `complete-${selectedOwnJob.id}`
                  ? "Updating..."
                  : "Mark completed"
              }
              onPress={() => {
                void onUpdateJobStatus(
                  `complete-${selectedOwnJob.id}`,
                  () => completeBooking(selectedOwnJob.id, accessToken),
                  "Job marked completed."
                );
              }}
              disabled={jobActionLoadingId === `complete-${selectedOwnJob.id}`}
              testID={`jobs-complete-${selectedOwnJob.id}`}
            />
          ) : null}
          {selectedOwnJob.status === "completed" ? (
            <AppButton
              label={
                jobActionLoadingId === `payment-done-${selectedOwnJob.id}`
                  ? "Updating..."
                  : "Mark payment done"
              }
              onPress={() => {
                void onUpdateJobStatus(
                  `payment-done-${selectedOwnJob.id}`,
                  () => markPaymentDone(selectedOwnJob.id, accessToken),
                  "Payment marked done."
                );
              }}
              disabled={jobActionLoadingId === `payment-done-${selectedOwnJob.id}`}
              testID={`jobs-payment-done-${selectedOwnJob.id}`}
            />
          ) : null}
          {selectedOwnJob.status === "payment_received" ? (
            <AppButton
              label={
                jobActionLoadingId === `close-${selectedOwnJob.id}` ? "Closing..." : "Close job"
              }
              onPress={() => {
                void onUpdateJobStatus(
                  `close-${selectedOwnJob.id}`,
                  () => closeBooking(selectedOwnJob.id, accessToken),
                  "Job closed."
                );
              }}
              disabled={jobActionLoadingId === `close-${selectedOwnJob.id}`}
              testID={`jobs-close-${selectedOwnJob.id}`}
            />
          ) : null}
          {(selectedOwnJob.status === "posted" ||
            selectedOwnJob.status === "accepted" ||
            selectedOwnJob.status === "in_progress") ? (
            <AppButton
              label={
                jobActionLoadingId === `cancel-${selectedOwnJob.id}`
                  ? "Cancelling..."
                  : "Cancel booking"
              }
              onPress={() => {
                void onUpdateJobStatus(
                  `cancel-${selectedOwnJob.id}`,
                  () =>
                    cancelBooking(
                      selectedOwnJob.id,
                      { reason: cancelReason.trim() || undefined },
                      accessToken
                    ),
                  "Booking cancelled."
                );
              }}
              variant="ghost"
              disabled={jobActionLoadingId === `cancel-${selectedOwnJob.id}`}
              testID={`jobs-cancel-${selectedOwnJob.id}`}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {selectedApplicantProfile ? (
        <SectionCard title="Applicant profile preview">
          <Text style={styles.dataTitle}>{selectedApplicantProfile.displayName}</Text>
          <Text style={styles.dataMeta}>Member ID: {selectedApplicantProfile.userId}</Text>
          <Text style={styles.dataMeta}>
            Location:{" "}
            {[selectedApplicantProfile.city, selectedApplicantProfile.area]
              .filter(Boolean)
              .join(", ") || "Not provided"}
          </Text>
          <Text style={styles.dataMeta}>
            Services:{" "}
            {selectedApplicantProfile.serviceSkills.length > 0
              ? selectedApplicantProfile.serviceSkills
                  .map((skill) => `${skill.jobName} (${skill.proficiency})`)
                  .join(", ")
              : selectedApplicantProfile.serviceCategories.length > 0
                ? selectedApplicantProfile.serviceCategories.join(", ")
                : "Not provided"}
          </Text>
          <Text style={styles.dataMeta}>
            Phone:{" "}
            {selectedApplicantProfile.visibility.phone
              ? selectedApplicantProfile.contact.phone ?? "Not provided"
              : selectedApplicantProfile.contact.phoneMasked ?? "Hidden"}
          </Text>
        </SectionCard>
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
