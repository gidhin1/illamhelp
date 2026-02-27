"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  TextArea,
  TextInput
} from "@/components/ui/primitives";
import { createJob, formatDate, JobRecord, listJobs } from "@/lib/api";

interface CreateJobFormState {
  category: string;
  title: string;
  description: string;
  locationText: string;
}

const initialCreateJobForm: CreateJobFormState = {
  category: "",
  title: "",
  description: "",
  locationText: ""
};

export default function JobsPage(): JSX.Element {
  const { accessToken } = useSession();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateJobFormState>(initialCreateJobForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const records = await listJobs(accessToken);
      setJobs(records);
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

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Jobs"
            title="Post and track household requests"
            subtitle="Create work requests and track active opportunities."
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
                  <div className="kpi-label">Completed</div>
                  <div className="kpi-value">{totalByStatus.completed ?? 0}</div>
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
                  <div>
                    <Button type="submit" disabled={createLoading}>
                      {createLoading ? "Posting..." : "Post job"}
                    </Button>
                  </div>
                </form>
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Open jobs</h3>
                {listError ? <Banner tone="error">{listError}</Banner> : null}
                {listLoading ? <p className="muted-text">Loading jobs...</p> : null}
                {!listLoading && jobs.length === 0 ? (
                  <EmptyState
                    title="No jobs yet"
                    body="Create the first request to see it listed here."
                  />
                ) : null}
                {!listLoading ? (
                  <div className="grid two">
                    {jobs.map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`}>
                        <Card className="stack">
                          <div className="pill">{job.status}</div>
                          <h4>{job.title}</h4>
                          <p className="muted-text">
                            {job.category} · {job.locationText}
                          </p>
                          <p className="muted-text">{job.description}</p>
                          <p className="field-hint">Created: {formatDate(job.createdAt)}</p>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </Card>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
