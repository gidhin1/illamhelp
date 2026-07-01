"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
        <Card soft className="job-loading-row" key={item}>
          <div className="skeleton-line" style={{ width: "42%" }} />
          <div className="skeleton-line" style={{ width: "82%" }} />
          <div className="skeleton-line" style={{ width: "58%" }} />
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
    <Card soft className="stack">
      <h3>{title}</h3>
      <p className="muted-text">{body}</p>
      {action}
    </Card>
  );
}

export default function JobsPage(): JSX.Element {
  return <JobsWorkspace section="discover" />;
}

export function JobsWorkspace({
  section = "discover"
}: {
  section?: "discover" | "posted" | "assigned";
}): JSX.Element {
  const { accessToken, user } = useSession();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobMediaByJobId, setJobMediaByJobId] = useState<Record<string, PublicMediaAssetRecord[]>>({});
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [myApplicationsByJob, setMyApplicationsByJob] = useState<
    Record<string, JobApplicationRecord>
  >({});
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateJobFormState>(initialCreateJobForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<string | null>(null);
  const [jobActionSuccess, setJobActionSuccess] = useState<string | null>(null);
  const [applyingJob, setApplyingJob] = useState<JobRecord | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);
    try {
      const [jobsResult, myApplications] = await Promise.all([
        listJobs(accessToken, { limit: 100 }),
        listMyJobApplications(accessToken)
      ]);
      setJobs(jobsResult.items);
      setNextCursor(jobsResult.nextCursor);
      setMyApplicationsByJob(buildLatestApplicationByJob(myApplications));
      const mediaEntries = await Promise.all(
        jobsResult.items.map(async (job) => {
          try {
            const page = await listJobMediaPage(job.id, accessToken);
            return [job.id, page.items.filter((asset) => asset.purpose === "job")] as const;
          } catch {
            return [job.id, []] as const;
          }
        })
      );
      setJobMediaByJobId(Object.fromEntries(mediaEntries));
    } catch (requestError) {
      setListError(requestError instanceof Error ? requestError.message : "Unable to load jobs");
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  const loadMoreJobs = async (): Promise<void> => {
    if (!accessToken || !nextCursor) return;
    setListLoading(true);
    setListError(null);
    try {
      const result = await listJobs(accessToken, { limit: 100, cursor: nextCursor });
      setJobs((previous) => [...previous, ...result.items]);
      setNextCursor(result.nextCursor);
      const mediaEntries = await Promise.all(
        result.items.map(async (job) => {
          try {
            const page = await listJobMediaPage(job.id, accessToken);
            return [job.id, page.items.filter((asset) => asset.purpose === "job")] as const;
          } catch {
            return [job.id, []] as const;
          }
        })
      );
      setJobMediaByJobId((previous) => ({ ...previous, ...Object.fromEntries(mediaEntries) }));
    } catch (requestError) {
      setListError(requestError instanceof Error ? requestError.message : "Unable to load more jobs");
    } finally {
      setListLoading(false);
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

  const totalByStatus = useMemo(() => {
    return jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [jobs]);

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
        subtitle: "Create jobs, review applicants, and manage the work you own."
      };
    }
    if (section === "assigned") {
      return {
        title: "Jobs assigned to me",
        subtitle: "Track accepted work, progress milestones, and payment states."
      };
    }
    return {
      title: "Discover jobs",
      subtitle: "Explore public and trusted-network opportunities from the new drawer-led workspace."
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

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const created = await createJob(form, accessToken);
      setJobs((previous) => [created, ...previous]);
      setCreateSuccess("Job posted successfully.");
      setForm(initialCreateJobForm);
    } catch (requestError) {
      setCreateError(requestError instanceof Error ? requestError.message : "Unable to create job");
    } finally {
      setCreateLoading(false);
    }
  };

  const onApply = async (jobId: string, message: string): Promise<void> => {
    if (!accessToken) return;
    setJobActionLoadingId(jobId);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      const created = await applyToJob(
        jobId,
        { message: message.trim() },
        accessToken
      );
      setMyApplicationsByJob((previous) => ({ ...previous, [jobId]: created }));
      setJobActionSuccess("Application submitted.");
      setApplyingJob(null);
      setApplicationMessage("");
    } catch (requestError) {
      setJobActionError(
        requestError instanceof Error ? requestError.message : "Unable to apply for this job"
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
      setJobActionSuccess("Pending application removed.");
    } catch (requestError) {
      setJobActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to remove pending application"
      );
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const renderJobs = (items: JobRecord[], type: "posted" | "external"): JSX.Element => (
    <div className="media-page-grid">
      {items.map((job, index) => {
        const application = myApplicationsByJob[job.id] ?? null;
        const canApply = type === "external" && job.status === "posted"
          && (!application || application.status === "withdrawn" || application.status === "rejected");
        const canWithdraw = type === "external" && job.status === "posted"
          && application ? isPendingApplication(application.status) : false;
        const personId = type === "posted" ? job.assignedProviderUserId ?? job.seekerUserId : job.seekerUserId;
        const mediaItems = jobMediaByJobId[job.id] ?? [];
        return (
          <article
            className="job-story-card motion-row-change"
            key={job.id}
            style={{ "--i": index } as CSSProperties & Record<"--i", number>}
          >
            <div className="job-story-topline">
              <PersonSummary
                userId={personId}
                profile={profilesByUserId[personId]}
                meta={type === "posted" && !job.assignedProviderUserId ? "No provider assigned yet" : undefined}
                compact
              />
              <StatusLabel tone={jobStatusTone(job.status)}>{job.status.replaceAll("_", " ")}</StatusLabel>
            </div>

            <Link href={`/jobs/${job.id}`} className="job-story-title">{job.title}</Link>
            <p className="job-story-meta">
              {job.category} in {job.locationText} · Posted {formatDate(job.createdAt).split(",")[0]}
            </p>

            <MediaPreviewGrid
              items={mediaItems}
              emptyText="No approved job media yet."
              testId={`job-media-${job.id}`}
            />

            <div className="job-story-foot">
              <div className="job-story-privacy">
                <span>{jobPrivacyLabel(job)}</span>
                <span>{mediaItems.length} approved media</span>
              </div>
              <div className="job-story-actions">
              {type === "posted" ? (
                <Button type="button" variant="ghost" onClick={() => router.push(`/jobs/${job.id}`)}>Manage job</Button>
              ) : null}
              {canApply ? (
                <Button type="button" disabled={jobActionLoadingId === job.id} onClick={() => { setApplyingJob(job); setApplicationMessage(""); }}>Apply for job</Button>
              ) : null}
              {canWithdraw && application ? (
                <Button type="button" variant="secondary" disabled={jobActionLoadingId === job.id} onClick={() => void onWithdraw(application)}>Withdraw application</Button>
              ) : null}
              {type === "external" ? <Link className="button ghost" href={`/jobs/${job.id}`}>View details</Link> : null}
              </div>
            </div>
          </article>
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
                Refresh list
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
                    background: active ? "color-mix(in srgb, var(--brand) 14%, var(--surface))" : "var(--surface)",
                    color: active ? "var(--brand)" : "var(--ink)",
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
              <div className="media-page-hero">
                <div>
                  <p className="surface-label">People and proof</p>
                  <h2>Jobs from people, with proof up front.</h2>
                  <p className="muted-text">
                    Review who posted the work, what privacy state it uses, and the safest next action before opening the details.
                  </p>
                </div>
                <div className="media-hero-stats" aria-label="Job summary">
                  <div>
                    <strong>{jobs.length}</strong>
                    <span>Total jobs</span>
                  </div>
                  <div>
                    <strong>{totalByStatus.posted ?? 0}</strong>
                    <span>Open</span>
                  </div>
                  <div>
                    <strong>{totalByStatus.accepted ?? 0}</strong>
                    <span>Assigned</span>
                  </div>
                </div>
              </div>

              {section === "posted" ? (
                <section className="media-section-stack" aria-labelledby="posted-jobs-heading">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Your requests</p>
                      <h3 id="posted-jobs-heading">Jobs posted by me</h3>
                    </div>
                    <a className="button ghost" href="#post-new-job">Create job</a>
                  </div>
                  {jobsPostedByMe.length > 0 ? (
                    renderJobs(jobsPostedByMe, "posted")
                  ) : (
                    <ActionEmptyState
                      title="No jobs posted"
                      body="Create a job when you are ready to share the need, privacy scope, and any approved job media."
                      action={<a className="button ghost" href="#post-new-job">Create job</a>}
                    />
                  )}
                </section>
              ) : null}

              {section === "posted" ? (
                <Card className="media-composer-card stack" id="post-new-job">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Next safe action</p>
                      <h3>Post a new job</h3>
                    </div>
                    <StatusLabel tone="info">{form.visibility === "public" ? "Public" : "Connections only"}</StatusLabel>
                  </div>
                  {createError ? <Banner tone="error">{createError}</Banner> : null}
                  {createSuccess ? <Banner tone="success">{createSuccess}</Banner> : null}
                  <form className="grid two" onSubmit={onCreate}>
                    <Field label="Category" hint="e.g. plumber, electrician">
                      <TextInput
                        value={form.category}
                        onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Location" hint="e.g. Kakkanad, Kochi">
                      <TextInput
                        value={form.locationText}
                        onChange={(e) => setForm((prev) => ({ ...prev, locationText: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Title" hint="Brief summary of the need">
                      <TextInput
                        value={form.title}
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Description" hint="Detailed requirements">
                      <TextArea
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        required minLength={10}
                      />
                    </Field>
                    <Field label="Visibility" hint="Who can see this job?">
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
                        <p className="surface-label">Work in hand</p>
                        <h3 id="assigned-jobs-heading">Jobs assigned to me</h3>
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
                          <p className="surface-label">Trusted network</p>
                          <h3 id="network-jobs-heading">Network jobs</h3>
                        </div>
                      </div>
                      {jobsFromConnectedPeople.length > 0 ? (
                        renderJobs(jobsFromConnectedPeople, "external")
                      ) : (
                        <ActionEmptyState
                          title="No network jobs"
                          body="Connections-only work appears here when trusted members post jobs for their network."
                          action={<Link className="button ghost" href="/connections">Review people</Link>}
                        />
                      )}
                    </section>

                    <section className="media-section-stack" aria-labelledby="public-jobs-heading">
                      <div className="media-section-title">
                        <div>
                          <p className="surface-label">Public jobs</p>
                          <h3 id="public-jobs-heading">Open market</h3>
                        </div>
                      </div>
                      {publicJobs.length > 0 ? (
                        renderJobs(publicJobs, "external")
                      ) : (
                        <ActionEmptyState
                          title="No public jobs"
                          body="Public opportunities are quiet right now. Check your privacy state or refresh before applying elsewhere."
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
                <div className="dialog-layer">
                  <button className="dialog-scrim" type="button" aria-label="Cancel application" onClick={() => setApplyingJob(null)} />
                  <Card className="application-dialog motion-dialog" role="dialog" aria-modal="true" aria-labelledby="application-dialog-title">
                    <h2 id="application-dialog-title">Apply for {applyingJob.title}</h2>
                    <Field label="Message to seeker" hint="Explain how you can help with this job.">
                      <TextArea
                        autoFocus
                        value={applicationMessage}
                        onChange={(event) => setApplicationMessage(event.target.value)}
                        required
                        minLength={10}
                      />
                    </Field>
                    <div className="job-mobile-actions">
                      <Button
                        type="button"
                        disabled={applicationMessage.trim().length < 10 || jobActionLoadingId === applyingJob.id}
                        onClick={() => void onApply(applyingJob.id, applicationMessage)}
                      >
                        {jobActionLoadingId === applyingJob.id ? "Submitting..." : "Submit application"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setApplyingJob(null)}>Cancel</Button>
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
