"use client";

import { applicationMessageHint, formatUiError, validateApplicationMessage } from "@illamhelp/shared-types";

import { Dialog } from "@illamhelp/ui-web/dialog";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
import { PageShell } from "@/components/PageShell";
import { PersonSummary } from "@/components/PersonSummary";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  applyToJob,
  createJob,
  formatDate,
  getProfileByUserId,
  JobApplicationRecord,
  JobRecord,
  listJobMediaPage,
  listJobs,
  listMyJobApplications,
  ProfileRecord,
  PublicMediaAssetRecord,
  withdrawJobApplication
} from "@/lib/api";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionHeader,
  Skeleton,
  SelectInput,
  StatusLabel,
  TextArea,
  TextInput
} from "@/components/ui/primitives";

interface CreateJobFormState {
  category: string;
  title: string;
  description: string;
  locationText: string;
  visibility: "public" | "connections_only";
}

const initialCreateJobForm: CreateJobFormState = {
  category: "",
  title: "",
  description: "",
  locationText: "",
  visibility: "public"
};

function buildLatestApplicationByJob(
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

function isPendingApplication(status: JobApplicationRecord["status"]): boolean {
  return status === "applied" || status === "shortlisted";
}

function jobPrivacyLabel(job: JobRecord): string {
  return job.visibility === "connections_only" ? "Connections only" : "Public";
}

function jobStatusTone(status: JobRecord["status"]): "info" | "success" | "warning" | "neutral" {
  if (status === "posted") return "info";
  if (status === "accepted" || status === "completed") return "success";
  if (status === "cancelled") return "warning";
  return "neutral";
}

function JobsLoadingSkeleton({ label }: { label: string }): JSX.Element {
  return (
    <div className="job-loading-list" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <Card soft variant="record" className="job-loading-row" key={item}>
          <Skeleton lines={3} />
        </Card>
      ))}
    </div>
  );
}

function ActionEmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: JSX.Element;
}): JSX.Element {
  return (
    <Card soft variant="action" className="stack">
      <h3>{title}</h3>
      <p className="muted-text">{body}</p>
      {action}
    </Card>
  );
}

export default function JobsPage(): JSX.Element {
  return <JobsWorkspace section="discover" />;
}

function ApprovedJobMedia({ jobId, accessToken }: { jobId: string; accessToken: string }): JSX.Element {
  const [items, setItems] = useState<PublicMediaAssetRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listJobMediaPage(jobId, accessToken).then((page) => {
      if (!cancelled) {
        setItems(page.items.filter((asset) => asset.purpose === "job"));
        setError(null);
      }
    }).catch((requestError) => {
      if (!cancelled) setError(formatUiError(requestError, "Couldn’t load approved job media. Close and try again."));
    });
    return () => { cancelled = true; };
  }, [accessToken, jobId]);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!items) return <p className="muted-text" role="status">Loading approved media…</p>;
  return <MediaPreviewGrid items={items} emptyText="No approved job media yet." testId={`job-media-${jobId}`} />;
}

export function JobsWorkspace({
  section = "discover"
}: {
  section?: "discover" | "posted" | "assigned";
}): JSX.Element {
  const { accessToken, user } = useSession();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [openMediaJobId, setOpenMediaJobId] = useState<string | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [myApplicationsByJob, setMyApplicationsByJob] = useState<
    Record<string, JobApplicationRecord>
  >({});
  const [listLoading, setListLoading] = useState(true);
  const listGeneration = useRef(0);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateJobFormState>(initialCreateJobForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [postedJob, setPostedJob] = useState<JobRecord | null>(null);

  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<string | null>(null);
  const [jobActionSuccess, setJobActionSuccess] = useState<string | null>(null);
  const [applyingJob, setApplyingJob] = useState<JobRecord | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState<string | null>(null);

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    const generation = ++listGeneration.current;
    setListLoading(true);
    setListError(null);
    try {
      const [jobsResult, myApplications] = await Promise.all([
        listJobs(accessToken, { limit: 100 }),
        listMyJobApplications(accessToken)
      ]);
      if (generation !== listGeneration.current) return;
      setJobs(jobsResult.items);
      setNextCursor(jobsResult.nextCursor);
      setMyApplicationsByJob(buildLatestApplicationByJob(myApplications));
    } catch (requestError) {
      if (generation === listGeneration.current) setListError(formatUiError(requestError, "Couldn’t load jobs. Refresh the list to try again."));
    } finally {
      if (generation === listGeneration.current) setListLoading(false);
    }
  }, [accessToken]);

  const loadMoreJobs = async (): Promise<void> => {
    if (!accessToken || !nextCursor) return;
    const generation = ++listGeneration.current;
    setListLoading(true);
    setListError(null);
    try {
      const result = await listJobs(accessToken, { limit: 100, cursor: nextCursor });
      if (generation !== listGeneration.current) return;
      setJobs((previous) => [...previous, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (requestError) {
      if (generation === listGeneration.current) setListError(formatUiError(requestError, "Couldn’t load more jobs. Try again."));
    } finally {
      if (generation === listGeneration.current) setListLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!accessToken || jobs.length === 0) return;
    const ids = Array.from(
      new Set(
        jobs
          .flatMap((job) => [job.seekerUserId, job.assignedProviderUserId])
          .filter((userId): userId is string => Boolean(userId))
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
  }, [accessToken, jobs, profilesByUserId]);

  const jobsPostedByMe = useMemo(() => {
    const currentUserId = user?.publicUserId;
    if (!currentUserId) return [];
    return jobs.filter((job) => job.seekerUserId === currentUserId);
  }, [jobs, user?.publicUserId]);

  const jobsAssignedToMe = useMemo(() => {
    const currentUserId = user?.publicUserId;
    if (!currentUserId) return [];
    return jobs.filter(
      (job) => job.assignedProviderUserId === currentUserId && job.seekerUserId !== currentUserId
    );
  }, [jobs, user?.publicUserId]);

  const jobsFromConnectedPeople = useMemo(() => {
    const currentUserId = user?.publicUserId;
    return jobs.filter(
      (job) =>
        job.seekerUserId !== currentUserId &&
        job.assignedProviderUserId !== currentUserId &&
        (job.visibility === "connections_only" || job.status !== "posted")
    );
  }, [jobs, user?.publicUserId]);

  const publicJobs = useMemo(() => {
    const currentUserId = user?.publicUserId;
    return jobs.filter(
      (job) =>
        job.seekerUserId !== currentUserId &&
        job.assignedProviderUserId !== currentUserId &&
        job.visibility === "public" &&
        job.status === "posted"
    );
  }, [jobs, user?.publicUserId]);
  const headerCopy = useMemo(() => {
    if (section === "posted") {
      return {
        title: "Jobs posted by me",
        subtitle: "Post jobs, review applicants, and manage your bookings."
      };
    }
    if (section === "assigned") {
      return {
        title: "Jobs assigned to me",
        subtitle: "Track your assigned jobs, progress, and payment status."
      };
    }
    return {
      title: "Discover jobs",
      subtitle: "Browse public jobs and jobs from your connections."
    };
  }, [section]);

  const sectionLinks = useMemo(
    () => [
      {
        key: "discover" as const,
        label: "Discover",
        href: "/jobs/discover"
      },
      {
        key: "posted" as const,
        label: "Posted by me",
        href: "/jobs/posted"
      },
      {
        key: "assigned" as const,
        label: "Assigned to me",
        href: "/jobs/assigned"
      }
    ],
    []
  );

  useEffect(() => {
    if (section !== "posted" || !accessToken || listLoading || window.location.hash !== "#post-new-job") return;
    const frame = requestAnimationFrame(() => document.getElementById("post-new-job")?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [section, accessToken, listLoading]);

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || createLoading) return;
    setCreateLoading(true);
    setCreateError(null);
    setPostedJob(null);
    try {
      const created = await createJob(form, accessToken);
      setJobs((previous) => [created, ...previous]);
      setPostedJob(created);
      setForm(initialCreateJobForm);
      // A list request started before the write can still return the old list.
      void loadJobs();
    } catch (requestError) {
      setCreateError(formatUiError(requestError, "Couldn’t post the job. Check the details and try again."));
    } finally {
      setCreateLoading(false);
    }
  };

  const onApply = async (jobId: string, message: string): Promise<void> => {
    if (!accessToken || jobActionLoadingId) return;
    const validationError = validateApplicationMessage(message);
    setApplicationError(validationError);
    if (validationError) return;
    setJobActionLoadingId(jobId);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      const created = await applyToJob(
        jobId,
        { message: message.trim() || undefined },
        accessToken
      );
      setMyApplicationsByJob((previous) => ({ ...previous, [jobId]: created }));
      setJobActionSuccess("Application submitted.");
      setApplyingJob(null);
      setApplicationMessage("");
    } catch (requestError) {
      setApplicationError(
        formatUiError(requestError, "Couldn’t send your application. Check that the job is still open and try again.")
      );
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const onWithdraw = async (application: JobApplicationRecord): Promise<void> => {
    if (!accessToken) return;
    setJobActionLoadingId(application.jobId);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      const updated = await withdrawJobApplication(application.id, accessToken);
      setMyApplicationsByJob((previous) => ({ ...previous, [application.jobId]: updated }));
      setJobActionSuccess("Application withdrawn.");
    } catch (requestError) {
      setJobActionError(
        formatUiError(requestError, "Couldn’t withdraw your application. Refresh the job and try again.")
      );
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const renderJobs = (items: JobRecord[], type: "posted" | "external"): JSX.Element => (
    <div className="job-record-list">
      {items.map((job) => {
        const application = myApplicationsByJob[job.id] ?? null;
        const canApply = type === "external" && job.status === "posted"
          && (!application || application.status === "withdrawn" || application.status === "rejected");
        const canWithdraw = type === "external" && job.status === "posted"
          && application ? isPendingApplication(application.status) : false;
        const personId = type === "posted" ? job.assignedProviderUserId ?? job.seekerUserId : job.seekerUserId;
        const mediaOpen = openMediaJobId === job.id;
        return (
          <Card as="article" className="job-record stack" key={job.id} variant="record">
            <div className="card-record-heading">
              <h3><Link href={`/jobs/${job.id}`} className="job-story-title">{job.title}</Link></h3>
              <StatusLabel tone={jobStatusTone(job.status)}>{job.status.replaceAll("_", " ")}</StatusLabel>
            </div>
            <p className="job-story-meta">
              {job.category} · {job.locationText} · Posted {formatDate(job.createdAt).split(",")[0]}
            </p>
            <div className="job-story-topline">
              <PersonSummary
                userId={personId}
                profile={profilesByUserId[personId]}
                meta={type === "posted" && !job.assignedProviderUserId ? "No provider assigned yet" : undefined}
                compact
              />
            </div>
            <p className="job-record-description">{job.description}</p>
            <div className="job-story-foot">
              <div className="job-story-privacy">
                <span>Visibility: {jobPrivacyLabel(job)}</span>
              </div>
              <div className="job-story-actions">
              {type === "posted" ? (
                <Button type="button" variant="ghost" onClick={() => router.push(`/jobs/${job.id}`)}>Manage job</Button>
              ) : null}
              {canApply ? (
                <Button type="button" disabled={jobActionLoadingId === job.id} onClick={() => { setApplyingJob(job); setApplicationMessage(""); setApplicationError(null); }}>Apply for job</Button>
              ) : null}
              {canWithdraw && application ? (
                <Button type="button" variant="secondary" disabled={jobActionLoadingId === job.id} onClick={() => void onWithdraw(application)}>Withdraw application</Button>
              ) : null}
              {type === "external" ? <Link className="button ghost" href={`/jobs/${job.id}`}>View details</Link> : null}
              </div>
            </div>
            {accessToken ? (
              <div>
                <Button variant="ghost" type="button" aria-expanded={mediaOpen} onClick={() => setOpenMediaJobId(mediaOpen ? null : job.id)}>
                  {mediaOpen ? "Hide approved media" : "View approved media"}
                </Button>
                {mediaOpen ? <ApprovedJobMedia key={job.id} jobId={job.id} accessToken={accessToken} /> : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Jobs"
            title={headerCopy.title}
            subtitle={headerCopy.subtitle}
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadJobs()}>
                Refresh jobs
              </Button>
            }
          />
          <nav
            aria-label="Job workspace sections"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            {sectionLinks.map((item) => {
              const active = item.key === section;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "44px",
                    padding: "0 18px",
                    borderRadius: "999px",
                    border: `1px solid ${active ? "var(--brand)" : "var(--line)"}`,
                    background: active ? "var(--surface-2)" : "var(--surface)",
                    color: active ? "var(--brand-text)" : "var(--ink)",
                    fontWeight: active ? 700 : 600,
                    textDecoration: "none"
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <RequireSession>
            <div className="stack">
              {section === "posted" ? (
                <section className="media-section-stack" aria-labelledby="posted-jobs-heading">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Your job posts</p>
                      <h2 id="posted-jobs-heading">Jobs posted by me</h2>
                    </div>
                    <a className="button ghost" href="#post-new-job">Create job</a>
                  </div>
                  {jobsPostedByMe.length > 0 ? (
                    renderJobs(jobsPostedByMe, "posted")
                  ) : (
                    <ActionEmptyState
                      title="No jobs posted"
                      body="Post a job and choose who can view it."
                      action={<a className="button ghost" href="#post-new-job">Create job</a>}
                    />
                  )}
                </section>
              ) : null}

              {section === "posted" ? (
                <Card variant="action" className="media-composer-card stack" id="post-new-job">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Job details</p>
                      <h2>Post a new job</h2>
                    </div>
                    <StatusLabel tone="info">{form.visibility === "public" ? "Public" : "Connections only"}</StatusLabel>
                  </div>
                  {createError ? <Banner tone="error">{createError}</Banner> : null}
                  {postedJob ? (
                    <div className="stack">
                      <Banner tone="success">Job posted successfully.</Banner>
                      <p>{postedJob.title} · {jobPrivacyLabel(postedJob)}</p>
                      <div><Link className="button secondary" href={`/jobs/${postedJob.id}#job-applicants`}>Review applicants</Link></div>
                    </div>
                  ) : null}
                  <form className="grid two" onSubmit={onCreate}>
                    <Field label="Category" hint="e.g. plumber, electrician">
                      <TextInput
                        value={form.category}
                        onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Location" hint="Enter your area and city, town or village.">
                      <TextInput
                        value={form.locationText}
                        onChange={(e) => setForm((prev) => ({ ...prev, locationText: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Title" hint="e.g. Fix a leaking kitchen tap">
                      <TextInput
                        value={form.title}
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Description" hint="Describe the work you need done.">
                      <TextArea
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        required minLength={10}
                      />
                    </Field>
                    <Field label="Visibility" hint="Public jobs can be found by members. Connections-only jobs are limited to your accepted connections.">
                      <SelectInput
                        value={form.visibility}
                        onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value as "public" | "connections_only" }))}
                      >
                        <option value="public">Public</option>
                        <option value="connections_only">Connections only</option>
                      </SelectInput>
                    </Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Button type="submit" disabled={createLoading}>
                        {createLoading ? "Posting job" : "Post job"}
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : null}

              {listError ? <Banner tone="error">{listError}</Banner> : null}
              {jobActionError ? <Banner tone="error">{jobActionError}</Banner> : null}
              {jobActionSuccess ? <Banner tone="success">{jobActionSuccess}</Banner> : null}
              {listLoading ? <JobsLoadingSkeleton label={`Loading ${headerCopy.title.toLowerCase()}`} /> : null}

              <div className="stack" style={{ gap: "var(--spacing-3xl)" }}>
                {section === "assigned" ? (
                  <section className="media-section-stack" aria-labelledby="assigned-jobs-heading">
                    <div className="media-section-title">
                      <div>
                        <p className="surface-label">Accepted work</p>
                        <h2 id="assigned-jobs-heading">Jobs assigned to me</h2>
                      </div>
                    </div>
                    {jobsAssignedToMe.length > 0 ? (
                      renderJobs(jobsAssignedToMe, "external")
                    ) : (
                      <ActionEmptyState
                        title="No assigned jobs"
                        body="Assigned work appears here after a seeker accepts you for a job."
                        action={<Link className="button ghost" href="/jobs/discover">Discover jobs</Link>}
                      />
                    )}
                  </section>
                ) : null}

                {section === "discover" ? (
                  <>
                    <section className="media-section-stack" aria-labelledby="network-jobs-heading">
                      <div className="media-section-title">
                        <div>
                                                    <h2 id="network-jobs-heading">Jobs from connections</h2>
                        </div>
                      </div>
                      {jobsFromConnectedPeople.length > 0 ? (
                        renderJobs(jobsFromConnectedPeople, "external")
                      ) : (
                        <ActionEmptyState
                          title="No jobs from connections"
                          body="Jobs that your connections share with their network appear here."
                          action={<Link className="button ghost" href="/connections">Review people</Link>}
                        />
                      )}
                    </section>

                    <section className="media-section-stack" aria-labelledby="public-jobs-heading">
                      <div className="media-section-title">
                        <div>
                                                    <h2 id="public-jobs-heading">Public jobs</h2>
                        </div>
                      </div>
                      {publicJobs.length > 0 ? (
                        renderJobs(publicJobs, "external")
                      ) : (
                        <ActionEmptyState
                          title="No public jobs"
                          body="Refresh to check for new job posts."
                          action={<Button type="button" variant="ghost" onClick={() => void loadJobs()}>Refresh jobs</Button>}
                        />
                      )}
                    </section>
                  </>
                ) : null}
              </div>

              {nextCursor ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Button type="button" variant="secondary" disabled={listLoading} onClick={() => void loadMoreJobs()}>
                    {listLoading ? "Loading jobs" : "Load more jobs"}
                  </Button>
                </div>
              ) : null}

              {applyingJob ? (
                <Dialog open onClose={() => { if (!jobActionLoadingId) setApplyingJob(null); }} titleId="application-dialog-title">
                  <h2 id="application-dialog-title">Apply for {applyingJob.title}</h2>
                  <form className="stack" onSubmit={(event) => {
                    event.preventDefault();
                    void onApply(applyingJob.id, applicationMessage);
                  }}>
                    <Field label="Message to the job poster (optional)" hint={applicationMessageHint} error={applicationError ?? undefined}>
                      <TextArea
                        autoFocus
                        value={applicationMessage}
                        readOnly={jobActionLoadingId === applyingJob.id}
                        onChange={(event) => { setApplicationMessage(event.target.value); setApplicationError(null); }}
                      />
                    </Field>
                    <div className="job-mobile-actions">
                      <Button type="submit" disabled={jobActionLoadingId === applyingJob.id}>
                        {jobActionLoadingId === applyingJob.id ? "Submitting..." : "Submit application"}
                      </Button>
                      <Button type="button" variant="secondary" disabled={!!jobActionLoadingId} onClick={() => setApplyingJob(null)}>Cancel</Button>
                    </div>
                  </form>
                </Dialog>
              ) : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
