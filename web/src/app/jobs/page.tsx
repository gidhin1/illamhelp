"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  applyToJob,
  createJob,
  formatDate,
  JobApplicationRecord,
  JobRecord,
  listJobs,
  listMyJobApplications,
  withdrawJobApplication
} from "@/lib/api";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  SelectInput,
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

export default function JobsPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
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

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const [jobsResult, myApplications] = await Promise.all([
        listJobs(accessToken, { limit: 200 }),
        listMyJobApplications(accessToken)
      ]);
      setJobs(jobsResult.items);
      setMyApplicationsByJob(buildLatestApplicationByJob(myApplications));
    } catch (requestError) {
      setListError(requestError instanceof Error ? requestError.message : "Unable to load jobs");
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const totalByStatus = useMemo(() => {
    return jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [jobs]);

  const jobsPostedByMe = useMemo(() => {
    const currentUserId = user?.publicUserId;
    if (!currentUserId) {
      return [];
    }
    return jobs.filter((job) => job.seekerUserId === currentUserId);
  }, [jobs, user?.publicUserId]);

  const jobsAssignedToMe = useMemo(() => {
    const currentUserId = user?.publicUserId;
    if (!currentUserId) {
      return [];
    }
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

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
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

  const onApply = async (jobId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setJobActionLoadingId(jobId);
    setJobActionError(null);
    setJobActionSuccess(null);
    try {
      const created = await applyToJob(
        jobId,
        { message: "I can take up this job. Please review my application." },
        accessToken
      );
      setMyApplicationsByJob((previous) => ({ ...previous, [jobId]: created }));
      setJobActionSuccess("Application submitted.");
    } catch (requestError) {
      setJobActionError(
        requestError instanceof Error ? requestError.message : "Unable to apply for this job"
      );
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const onWithdraw = async (application: JobApplicationRecord): Promise<void> => {
    if (!accessToken) {
      return;
    }
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

  const renderExternalJobsGrid = (rows: JobRecord[]): JSX.Element => {
    if (!listLoading && rows.length === 0) {
      return (
        <EmptyState
          title="No jobs in this section"
          body="New requests will appear here when available."
        />
      );
    }

    return (
      <div className="grid two">
        {rows.map((job) => {
          const application = myApplicationsByJob[job.id] ?? null;
          const canApply =
            job.status === "posted" &&
            (!application || application.status === "withdrawn" || application.status === "rejected");
          const canWithdraw =
            job.status === "posted" && application ? isPendingApplication(application.status) : false;
          const isAssignedToMe = application?.status === "accepted";
          const isWorking = job.assignedProviderUserId === user?.publicUserId;

          return (
            <Card key={job.id} className="stack">
              <div className="pill">{job.status}</div>
              <Link href={`/jobs/${job.id}`} className="data-title">
                {job.title}
              </Link>
              <p className="muted-text">
                {job.category} · {job.locationText}
              </p>
              <p className="muted-text">
                Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
              </p>
              <p className="muted-text">Posted by: {job.seekerUserId}</p>
              <p className="muted-text">{job.description}</p>
              <p className="field-hint">Created: {formatDate(job.createdAt)}</p>
              {application ? (
                <p className="muted-text">
                  Your application: <strong>{application.status}</strong>
                </p>
              ) : null}
              {isAssignedToMe || isWorking ? (
                <Banner tone="success">You are the assigned provider for this job.</Banner>
              ) : null}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {canApply ? (
                  <Button
                    type="button"
                    disabled={jobActionLoadingId === job.id}
                    onClick={() => void onApply(job.id)}
                  >
                    {jobActionLoadingId === job.id ? "Applying..." : "Apply for job"}
                  </Button>
                ) : null}
                {canWithdraw && application ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={jobActionLoadingId === job.id}
                    onClick={() => void onWithdraw(application)}
                  >
                    {jobActionLoadingId === job.id
                      ? "Removing..."
                      : "Remove pending application"}
                  </Button>
                ) : null}
                <Link href={`/jobs/${job.id}`}>
                  <Button type="button" variant="ghost">
                    View details
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Jobs"
            title="Find work and manage your postings"
            subtitle="Apply, manage applicants, and track lifecycle updates."
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadJobs()}>
                Refresh list
              </Button>
            }
          />
          <RequireSession>
            <div className="stack">
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Total jobs</div>
                  <div className="kpi-value">{jobs.length}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Posted</div>
                  <div className="kpi-value">{totalByStatus.posted ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Assigned</div>
                  <div className="kpi-value">{totalByStatus.accepted ?? 0}</div>
                </div>
              </div>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Create job</h3>
                {createError ? <Banner tone="error">{createError}</Banner> : null}
                {createSuccess ? <Banner tone="success">{createSuccess}</Banner> : null}
                <form className="grid two" onSubmit={onCreate}>
                  <Field label="Category">
                    <TextInput
                      value={form.category}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, category: event.target.value }))
                      }
                      placeholder="plumber"
                      required
                    />
                  </Field>
                  <Field label="Location text">
                    <TextInput
                      value={form.locationText}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, locationText: event.target.value }))
                      }
                      placeholder="Kakkanad, Kochi"
                      required
                    />
                  </Field>
                  <Field label="Title">
                    <TextInput
                      value={form.title}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="Kitchen sink leakage repair"
                      required
                    />
                  </Field>
                  <Field label="Description">
                    <TextArea
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Need an experienced plumber for urgent leak repair."
                      required
                      minLength={10}
                    />
                  </Field>
                  <Field label="Visibility">
                    <SelectInput
                      value={form.visibility}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          visibility: event.target.value as "public" | "connections_only"
                        }))
                      }
                    >
                      <option value="public">Public</option>
                      <option value="connections_only">Connections only</option>
                    </SelectInput>
                  </Field>
                  <div>
                    <Button type="submit" disabled={createLoading}>
                      {createLoading ? "Posting..." : "Post job"}
                    </Button>
                  </div>
                </form>
              </Card>

              {listError ? <Banner tone="error">{listError}</Banner> : null}
              {jobActionError ? <Banner tone="error">{jobActionError}</Banner> : null}
              {jobActionSuccess ? <Banner tone="success">{jobActionSuccess}</Banner> : null}
              {listLoading ? <p className="muted-text">Loading jobs...</p> : null}

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Jobs posted by me</h3>
                {!listLoading && jobsPostedByMe.length === 0 ? (
                  <EmptyState
                    title="You have not posted any jobs yet"
                    body="Create a job above, then open it here to manage applicants."
                  />
                ) : (
                  <div className="grid two">
                    {jobsPostedByMe.map((job) => (
                      <Card key={job.id} className="stack">
                        <div className="pill">{job.status}</div>
                        <Link href={`/jobs/${job.id}`} className="data-title">
                          {job.title}
                        </Link>
                        <p className="muted-text">
                          {job.category} · {job.locationText}
                        </p>
                        <p className="muted-text">
                          Visibility:{" "}
                          {job.visibility === "connections_only" ? "Connections only" : "Public"}
                        </p>
                        <p className="muted-text">
                          Assigned provider: {job.assignedProviderUserId ?? "Not assigned yet"}
                        </p>
                        <p className="field-hint">Created: {formatDate(job.createdAt)}</p>
                        <div>
                          <Link href={`/jobs/${job.id}`}>
                            <Button type="button">
                              {job.assignedProviderUserId
                                ? "Manage job/applicant"
                                : "Manage applicants"}
                            </Button>
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Jobs assigned to me</h3>
                {renderExternalJobsGrid(jobsAssignedToMe)}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Jobs from connected people</h3>
                {renderExternalJobsGrid(jobsFromConnectedPeople)}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Public jobs</h3>
                {renderExternalJobsGrid(publicJobs)}
              </Card>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
