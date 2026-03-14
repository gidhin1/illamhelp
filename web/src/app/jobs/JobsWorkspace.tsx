"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
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
  return <JobsWorkspace section="discover" />;
}

export function JobsWorkspace({
  section = "discover"
}: {
  section?: "discover" | "posted" | "assigned";
}): JSX.Element {
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
    if (!accessToken) return;
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

  const onApply = async (jobId: string): Promise<void> => {
    if (!accessToken) return;
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

  // Shared columns
  const getColumns = (type: "posted" | "external"): ColumnDef<JobRecord>[] => [
    {
      accessorKey: "title",
      header: "Job Title",
      cell: ({ row }) => <Link href={`/jobs/${row.original.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{row.original.title}</Link>,
    },
    {
      accessorKey: "category",
      header: "Category",
    },
    {
      accessorKey: "locationText",
      header: "Location",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.status}</span>,
    },
    {
      id: "person",
      header: type === "posted" ? "Assigned Provider" : "Posted By",
      cell: ({ row }) => type === "posted" ? (row.original.assignedProviderUserId || "-") : row.original.seekerUserId,
    },
    {
      accessorKey: "createdAt",
      header: "Posted On",
      cell: ({ row }) => formatDate(row.original.createdAt).split(",")[0],
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const job = row.original;
        
        if (type === "posted") {
          return (
            <Link href={`/jobs/${job.id}`}>
              <Button type="button" variant="ghost">Manage</Button>
            </Link>
          );
        }
        
        const application = myApplicationsByJob[job.id] ?? null;
        const canApply =
          job.status === "posted" &&
          (!application || application.status === "withdrawn" || application.status === "rejected");
        const canWithdraw =
          job.status === "posted" && application ? isPendingApplication(application.status) : false;

        return (
          <div style={{ display: "flex", gap: "8px" }}>
            {canApply && (
              <Button type="button" disabled={jobActionLoadingId === job.id} onClick={() => void onApply(job.id)}>
                Apply
              </Button>
            )}
            {canWithdraw && application && (
              <Button type="button" variant="secondary" disabled={jobActionLoadingId === job.id} onClick={() => void onWithdraw(application)}>
                Withdraw
              </Button>
            )}
            <Link href={`/jobs/${job.id}`}>
              <Button type="button" variant="ghost">View</Button>
            </Link>
          </div>
        );
      },
    },
  ];

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
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Total platform jobs</div>
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

              {section === "posted" ? (
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Post a New Job</h3>
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
                        {createLoading ? "Posting..." : "Post job"}
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : null}

              {listError ? <Banner tone="error">{listError}</Banner> : null}
              {jobActionError ? <Banner tone="error">{jobActionError}</Banner> : null}
              {jobActionSuccess ? <Banner tone="success">{jobActionSuccess}</Banner> : null}
              {listLoading ? <p className="muted-text">Loading data...</p> : null}

              <div className="stack" style={{ gap: "var(--spacing-3xl)" }}>
                {section === "posted" ? (
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Jobs Posted By Me</h3>
                    {jobsPostedByMe.length > 0 ? (
                      <DataTable columns={getColumns("posted")} data={jobsPostedByMe} />
                    ) : (
                      <EmptyState title="No jobs posted" body="You haven't posted any jobs yet." />
                    )}
                  </div>
                ) : null}

                {section === "assigned" ? (
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Jobs Assigned To Me</h3>
                    {jobsAssignedToMe.length > 0 ? (
                      <DataTable columns={getColumns("external")} data={jobsAssignedToMe} />
                    ) : (
                      <EmptyState title="No assigned jobs" body="You have not been assigned to any jobs yet." />
                    )}
                  </div>
                ) : null}

                {section === "discover" ? (
                  <>
                    <div>
                      <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Network Jobs</h3>
                      {jobsFromConnectedPeople.length > 0 ? (
                        <DataTable columns={getColumns("external")} data={jobsFromConnectedPeople} />
                      ) : (
                        <EmptyState title="No network jobs" body="No available jobs from your connections." />
                      )}
                    </div>

                    <div>
                      <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Public Market</h3>
                      {publicJobs.length > 0 ? (
                        <DataTable columns={getColumns("external")} data={publicJobs} />
                      ) : (
                        <EmptyState title="No public jobs" body="No public jobs available right now." />
                      )}
                    </div>
                  </>
                ) : null}
              </div>

            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
