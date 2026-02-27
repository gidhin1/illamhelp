"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionHeader,
  SelectInput,
  TextInput
} from "@/components/ui/primitives";
import {
  canViewConsent,
  CONSENT_FIELDS,
  ConsentField,
  formatDate,
  JobRecord,
  listJobs
} from "@/lib/api";

export default function JobDetailPage(): JSX.Element {
  const { accessToken } = useSession();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownerUserId, setOwnerUserId] = useState("");
  const [field, setField] = useState<ConsentField>("phone");
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [canView, setCanView] = useState<boolean | null>(null);

  const loadJob = useCallback(async (): Promise<void> => {
    if (!accessToken || !jobId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const jobs = await listJobs(accessToken);
      const found = jobs.find((item) => item.id === jobId) ?? null;
      setJob(found);
      setOwnerUserId(found?.seekerUserId ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load job");
    } finally {
      setLoading(false);
    }
  }, [accessToken, jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  const onCheckView = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setCheckLoading(true);
    setCheckError(null);
    try {
      const result = await canViewConsent({ ownerUserId: ownerUserId.trim(), field }, accessToken);
      setCanView(result.allowed);
    } catch (requestError) {
      setCheckError(
        requestError instanceof Error ? requestError.message : "Unable to check visibility"
      );
      setCanView(null);
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Job detail"
            title="Job details and contact visibility"
            subtitle="Review this request and check whether contact details are visible."
            actions={
              <Link href="/jobs">
                <Button variant="ghost">Back to jobs</Button>
              </Link>
            }
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {loading ? <p className="muted-text">Loading job...</p> : null}
              {!loading && !job ? (
                <Card className="stack">
                  <h3>Job not found</h3>
                  <p className="muted-text">The job may have been removed or ID is invalid.</p>
                </Card>
              ) : null}

              {job ? (
                <div className="grid two" style={{ alignItems: "start" }}>
                  <Card className="stack">
                    <div className="pill">{job.status}</div>
                    <h2 style={{ fontFamily: "var(--font-display)" }}>{job.title}</h2>
                    <div className="data-meta">
                      {job.category} · {job.locationText}
                    </div>
                    <div className="data-meta">Posted at: {formatDate(job.createdAt)}</div>
                    <div className="data-row">
                      <div className="data-title">Description</div>
                      <div className="data-meta">{job.description}</div>
                    </div>
                    <div className="data-row">
                      <div className="data-title">Posted by member</div>
                      <div className="data-meta">{job.seekerUserId}</div>
                    </div>
                  </Card>

                  <div className="stack">
                    <Card className="stack">
                      <h3 style={{ fontFamily: "var(--font-display)" }}>Contact visibility check</h3>
                      <p className="muted-text">
                        Check whether this contact detail is available for this connection.
                      </p>
                      {checkError ? <Banner tone="error">{checkError}</Banner> : null}
                      {canView !== null ? (
                        <Banner tone={canView ? "success" : "info"}>
                          {canView
                            ? "Available now."
                            : "Not available at the moment."}
                        </Banner>
                      ) : null}
                      <form className="stack" onSubmit={onCheckView}>
                        <Field label="Owner member ID">
                          <TextInput
                            value={ownerUserId}
                            onChange={(event) => setOwnerUserId(event.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Field">
                          <SelectInput
                            value={field}
                            onChange={(event) => setField(event.target.value as ConsentField)}
                          >
                            {CONSENT_FIELDS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                        <div>
                          <Button type="submit" disabled={checkLoading}>
                            {checkLoading ? "Checking..." : "Check visibility"}
                          </Button>
                        </div>
                      </form>
                    </Card>

                    <Card soft className="stack">
                      <h4>Professional media</h4>
                      <p className="muted-text">
                        Photos and videos should be service-related and professional.
                      </p>
                    </Card>
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
