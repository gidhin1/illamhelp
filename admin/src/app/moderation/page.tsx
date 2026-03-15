"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SelectInput,
  TextArea
} from "@/components/ui/primitives";
import {
  ModerationDetails,
  ModerationProcessResult,
  ModerationQueueItem,
  getModerationDetails,
  listModerationQueue,
  processModerationQueue,
  reviewMedia
} from "@/lib/api";

const statusOptions = ["pending", "running", "approved", "rejected", "error"] as const;

function ModerationContent(): React.JSX.Element {
  const { accessToken } = useSession();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [details, setDetails] = useState<ModerationDetails | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [reasonCode, setReasonCode] = useState("policy_manual_review");
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [processingResult, setProcessingResult] = useState<ModerationProcessResult | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const queueSummary = useMemo(() => {
    return {
      total: queue.length,
      pending: queue.filter((item) => item.status === "pending").length,
      reviewed: queue.filter((item) => item.status === "approved" || item.status === "rejected").length
    };
  }, [queue]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    void (async () => {
      setLoadingQueue(true);
      try {
        const items = await listModerationQueue(accessToken, { status: statusFilter, limit: 100 });
        if (!cancelled) {
          setQueue(items);
          setBanner(null);
          if (items.length === 0) {
            setSelectedMediaId(null);
            setDetails(null);
          } else if (!selectedMediaId || !items.some((item) => item.mediaId === selectedMediaId)) {
            setSelectedMediaId(items[0].mediaId);
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setQueue([]);
          setDetails(null);
          setSelectedMediaId(null);
          setBanner({
            tone: "error",
            message: requestError instanceof Error ? requestError.message : "Failed to load moderation queue"
          });
        }
      } finally {
        if (!cancelled) setLoadingQueue(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, selectedMediaId, statusFilter]);

  useEffect(() => {
    if (!accessToken || !selectedMediaId) return;

    let cancelled = false;
    void (async () => {
      setLoadingDetails(true);
      try {
        const result = await getModerationDetails(selectedMediaId, accessToken);
        if (!cancelled) setDetails(result);
      } catch (requestError) {
        if (!cancelled) {
          setDetails(null);
          setBanner({
            tone: "error",
            message: requestError instanceof Error ? requestError.message : "Failed to load moderation details"
          });
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, selectedMediaId]);

  async function refreshQueueAndDetails(activeMediaId: string | null): Promise<void> {
    if (!accessToken) return;

    const items = await listModerationQueue(accessToken, { status: statusFilter, limit: 100 });
    setQueue(items);

    if (activeMediaId && items.some((item) => item.mediaId === activeMediaId)) {
      const refreshed = await getModerationDetails(activeMediaId, accessToken);
      setDetails(refreshed);
      setSelectedMediaId(activeMediaId);
      return;
    }

    if (items.length > 0) {
      setSelectedMediaId(items[0].mediaId);
      const refreshed = await getModerationDetails(items[0].mediaId, accessToken);
      setDetails(refreshed);
      return;
    }

    setSelectedMediaId(null);
    setDetails(null);
  }

  async function onProcessPending(): Promise<void> {
    if (!accessToken) return;

    setSubmitting(true);
    try {
      const result = await processModerationQueue(accessToken, 20);
      setProcessingResult(result);
      await refreshQueueAndDetails(selectedMediaId);
      setBanner({
        tone: "success",
        message: `Processed ${result.processed} jobs (${result.technicalApproved} technical approvals, ${result.aiCompleted} AI decisions).`
      });
    } catch (requestError) {
      setBanner({ tone: "error", message: requestError instanceof Error ? requestError.message : "Failed to process queue" });
    } finally {
      setSubmitting(false);
    }
  }

  async function onReview(decision: "approved" | "rejected"): Promise<void> {
    if (!accessToken || !selectedMediaId) return;

    setSubmitting(true);
    try {
      await reviewMedia(
        selectedMediaId,
        { decision, reasonCode, notes: notes.trim() || undefined },
        accessToken
      );
      await refreshQueueAndDetails(selectedMediaId);
      setNotes("");
      setBanner({
        tone: "success",
        message: decision === "approved" ? "Media approved." : "Media rejected."
      });
    } catch (requestError) {
      setBanner({ tone: "error", message: requestError instanceof Error ? requestError.message : "Failed to submit review" });
    } finally {
      setSubmitting(false);
    }
  }

  const queueColumns: ColumnDef<ModerationQueueItem>[] = [
    {
      accessorKey: "kind",
      header: "Type",
      cell: ({ row }) => <span style={{ fontWeight: 600, textTransform: "capitalize", color: "var(--ink)" }}>{row.original.kind}</span>
    },
    {
      accessorKey: "context",
      header: "Context",
      cell: ({ row }) => <span className="pill">{row.original.context.replaceAll("_", " ")}</span>
    },
    {
      accessorKey: "mediaState",
      header: "State",
      cell: ({ row }) => <span className="pill">{row.original.mediaState.replaceAll("_", " ")}</span>
    },
    {
      accessorKey: "status",
      header: "Job Status",
      cell: ({ row }) => <span className="muted-text" style={{ textTransform: "capitalize" }}>{row.original.status}</span>
    },
    {
      id: "actions",
      header: "Action",
      cell: ({ row }) => (
        <Button
          variant={selectedMediaId === row.original.mediaId ? "primary" : "ghost"}
          style={{ padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
          onClick={() => setSelectedMediaId(row.original.mediaId)}
        >
          {selectedMediaId === row.original.mediaId ? "Reviewing" : "Select"}
        </Button>
      )
    }
  ];

  return (
    <div className="stack" style={{ gap: 0, height: "100vh" }}>
      <div className="top-header">
        <div>
           <div className="pill" style={{ marginBottom: "8px", background: "none", border: "none", padding: 0 }}>Content Safety</div>
           <h2 className="display-title" style={{ fontSize: "1.5rem" }}>Moderation Queue</h2>
        </div>
        <div className="section-actions">
           <Button type="button" variant="secondary" data-testid="moderation-process-pending" disabled={submitting} onClick={() => void onProcessPending()}>
             Run Machine Checks
           </Button>
        </div>
      </div>

      <div style={{ padding: "var(--spacing-xl)", flex: 1, minHeight: 0 }}>
        {banner && <div style={{ marginBottom: "var(--spacing-md)" }}><Banner tone={banner.tone}>{banner.message}</Banner></div>}
        {processingResult && (
           <div style={{ marginBottom: "var(--spacing-md)" }}>
             <Banner tone="info">Selected: {processingResult.selected}, Processed: {processingResult.processed}, Errors: {processingResult.errors}</Banner>
           </div>
        )}

        {/* Master Detail Grid Layout */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 400px", alignItems: "start", height: "100%" }}>
          {/* Master List */}
          <Card className="stack" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "var(--spacing-md)", borderBottom: "1px solid var(--line)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
               <div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>Queue items</h3>
                  <div className="muted-text" style={{ fontSize: "0.85rem" }}>
                    {queueSummary.total} total · {queueSummary.pending} pending · {queueSummary.reviewed} reviewed
                  </div>
               </div>
               <div style={{ minWidth: 150 }}>
                   <SelectInput data-testid="moderation-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: "0.85rem" }}>
                     {statusOptions.map((opt) => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
                   </SelectInput>
               </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
               {loadingQueue && (
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>Loading...</div>
               )}
               {!loadingQueue && queue.length === 0 ? (
                  <div style={{ padding: "var(--spacing-xl)" }}>
                     <EmptyState title="No items found" body="Try another filter or run machine checks to pull new items." />
                  </div>
               ) : (
                  <DataTable columns={queueColumns} data={queue} />
               )}
            </div>
          </Card>

          {/* Details Panel */}
          <Card className="stack" data-testid="moderation-details-panel" style={{ height: "calc(100vh - 160px)", overflowY: "auto", borderLeft: "4px solid var(--brand)", padding: "var(--spacing-lg)" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", paddingBottom: "10px", borderBottom: "1px solid var(--line)" }}>Review Details</h3>
            
            {loadingDetails && <p className="muted-text">Loading Details...</p>}
            
            {!loadingDetails && !details ? (
                <EmptyState title="Select an item" body="Choose a queue item to inspect AI scores and moderation history." />
            ) : details ? (
              <div className="stack" style={{ gap: "var(--spacing-lg)" }}>
                {/* Media Spec */}
                <div className="data-row" data-testid="moderation-media-summary" style={{ padding: "8px 12px", background: "var(--surface)" }}>
                  <div className="data-title" style={{ fontSize: "1rem" }}>{details.media.kind.toUpperCase()} file</div>
                  <div className="grid two" style={{ gap: "4px" }}>
                     <div className="data-meta" style={{ fontSize: "0.8rem" }}>Context: {details.media.context.replaceAll("_", " ")}</div>
                     <div className="data-meta" style={{ fontSize: "0.8rem" }}>Type: {details.media.contentType}</div>
                     <div className="data-meta" style={{ fontSize: "0.8rem" }}>Size: {(details.media.fileSizeBytes / 1024).toFixed(1)} KB</div>
                  </div>
                </div>

                {/* Media Preview Component */}
                <div data-testid="moderation-media-preview" style={{ background: "#000", borderRadius: "12px", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px", padding: 8 }}>
                  {details.media.kind === "image" ? (
                    <Image
                      data-testid="moderation-preview-image"
                      src={details.media.previewUrl}
                      alt={`Preview ${details.media.id}`}
                      width={1200}
                      height={800}
                      unoptimized
                      style={{ maxWidth: "100%", maxHeight: "250px", height: "auto", width: "auto", borderRadius: "8px" }}
                    />
                  ) : (
                    <video
                      data-testid="moderation-preview-video"
                      controls
                      preload="metadata"
                      style={{ width: "100%", maxHeight: "250px", borderRadius: "8px" }}
                    >
                      <source src={details.media.previewUrl} type={details.media.contentType} />
                    </video>
                  )}
                </div>

                {/* Form Elements */}
                <div className="stack" style={{ gap: "var(--spacing-md)", background: "var(--surface-2)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}>
                    <Field label="Policy Rationale Code">
                      <SelectInput data-testid="moderation-reason-code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                        <option value="policy_manual_review">policy_manual_review</option>
                        <option value="policy_safe_service_media">policy_safe_service_media</option>
                        <option value="policy_prohibited_content">policy_prohibited_content</option>
                        <option value="policy_unrelated_media">policy_unrelated_media</option>
                      </SelectInput>
                    </Field>

                    <Field label="Moderator Notes" hint="Optional internal notes">
                      <TextArea data-testid="moderation-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rationale..." style={{ minHeight: "60px" }} />
                    </Field>

                    <div style={{ display: "flex", gap: "8px", paddingTop: "8px" }}>
                      <Button type="button" data-testid="moderation-approve" disabled={submitting} onClick={() => void onReview("approved")} style={{ flex: 1 }}>
                        ✅ Approve
                      </Button>
                      <Button type="button" variant="secondary" data-testid="moderation-reject" disabled={submitting} onClick={() => void onReview("rejected")} style={{ flex: 1, color: "var(--danger)" }}>
                        ❌ Reject
                      </Button>
                    </div>
                </div>

                {/* Machine Job History */}
                <div className="stack" style={{ gap: "8px" }}>
                  <h4 style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Job Log</h4>
                  {details.moderationJobs.map((job) => (
                    <div key={job.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-md)", fontSize: "0.8rem", border: "1px solid var(--line)" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>{job.stage}</div>
                        {job.reasonCode ? <div className="muted-text">Reason: {job.reasonCode}</div> : null}
                      </div>
                      <span className="pill" style={{ padding: "2px 8px" }}>{job.status}</span>
                    </div>
                  ))}
                </div>

              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ModerationPage(): React.JSX.Element {
  return (
    <PageShell>
      <RequireAdminSession>
        <ModerationContent />
      </RequireAdminSession>
    </PageShell>
  );
}
