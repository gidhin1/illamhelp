"use client";

import { FormEvent, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";

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
  TextInput
} from "@/components/ui/primitives";
import {
  AdminTimelineResponse,
  fetchMemberTimeline,
  formatDate
} from "@/lib/api";

function AuditContent(): React.JSX.Element {
  const { accessToken } = useSession();
  const [memberId, setMemberId] = useState("");
  const [timeline, setTimeline] = useState<AdminTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accessToken) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchMemberTimeline(memberId.trim(), accessToken, 100);
      setTimeline(result);
    } catch (requestError) {
      setTimeline(null);
      setError(requestError instanceof Error ? requestError.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }

  const accessColumns: ColumnDef<AdminTimelineResponse["accessRequests"][0]>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.status}</span>,
    },
    {
      id: "parties",
      header: "People",
      cell: ({ row }) => (
        <div>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Requester: {row.original.requesterUserId}</div>
          <div className="muted-text">Details owner: {row.original.ownerUserId}</div>
        </div>
      )
    },
    {
      accessorKey: "requestedFields",
      header: "Fields",
      cell: ({ row }) => row.original.requestedFields.join(", ")
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
      cell: ({ row }) => <span className="muted-text">{row.original.purpose}</span>
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.createdAt).split(",")[0]
    }
  ];

  const grantColumns: ColumnDef<AdminTimelineResponse["consentGrants"][0]>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.status}</span>,
    },
    {
      id: "parties",
      header: "People",
      cell: ({ row }) => (
        <div>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>Shared by: {row.original.ownerUserId}</div>
          <div className="muted-text">Can view: {row.original.granteeUserId}</div>
        </div>
      )
    },
    {
      accessorKey: "grantedFields",
      header: "Fields",
      cell: ({ row }) => row.original.grantedFields.join(", ")
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
      cell: ({ row }) => <span className="muted-text">{row.original.purpose}</span>
    },
    {
      accessorKey: "grantedAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.grantedAt).split(",")[0]
    }
  ];

  const auditColumns: ColumnDef<AdminTimelineResponse["auditEvents"][0]>[] = [
    {
      accessorKey: "eventType",
      header: "Event",
      cell: ({ row }) => <span style={{ fontWeight: 600, color: "var(--ink)" }}>{row.original.eventType}</span>
    },
    {
      id: "actors",
      header: "Actor → Target",
      cell: ({ row }) => `${row.original.actorUserId ?? "system"} → ${row.original.targetUserId ?? "n/a"}`
    },
    {
      accessorKey: "purpose",
      header: "Context",
      cell: ({ row }) => <span className="muted-text">{row.original.purpose || "-"}</span>
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.createdAt)
    }
  ];

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="top-header">
        <div>
           <div className="pill" style={{ marginBottom: "8px", background: "none", border: "none", padding: 0 }}>Privacy Oversight</div>
           <h1 className="display-title" style={{ fontSize: "1.5rem" }}>Consent & Audit Timeline</h1>
        </div>
      </div>

      <div style={{ padding: "var(--spacing-xl)" }} className="stack">
        <Card className="stack" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
          <form className="grid" style={{ gridTemplateColumns: "1fr auto", alignItems: "end", gap: "10px" }} onSubmit={onSearch}>
            <Field label="Member to investigate" hint="Use the public member ID shown in profile, consent, or verification records.">
              <TextInput
                data-testid="timeline-member-id"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                placeholder="member_abc123"
                required
                style={{ fontSize: "1.1rem", padding: "12px 16px" }}
              />
            </Field>
            <div>
              <Button type="submit" data-testid="timeline-search" disabled={loading} style={{ height: "48px" }}>
                <Search size={18} /> {loading ? "Searching..." : "Search"}
              </Button>
            </div>
          </form>
          {error && <div style={{ marginTop: "10px" }}><Banner tone="error">{error}</Banner></div>}
        </Card>

        {!timeline && !loading ? (
          <EmptyState
            title="Investigate Activity"
            body="Enter a member ID to review contact-sharing approvals, consent requests, and related account activity."
          />
        ) : null}

        {timeline && (
          <div className="stack" style={{ gap: "var(--spacing-2xl)", marginTop: "var(--spacing-lg)" }}>
            <Card className="stack" data-testid="timeline-member-summary" style={{ borderColor: "color-mix(in srgb, var(--brand) 36%, var(--line))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                 <div className="stack" style={{ gap: "4px" }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem" }}>{timeline.member.publicUserId}</h3>
                    <div className="muted-text">Role: <span style={{ color: "var(--ink)", fontWeight: 600, textTransform: "capitalize" }}>{timeline.member.role}</span></div>
                 </div>
                 <div className="muted-text" style={{ fontSize: "0.9rem" }}>
                    Member since {formatDate(timeline.member.createdAt).split(",")[0]}
                 </div>
              </div>
            </Card>

            <div className="grid two" style={{ alignItems: "start" }}>
              <Card className="stack" data-testid="timeline-access-requests" style={{ overflow: "hidden" }}>
                <h3 style={{ fontFamily: "var(--font-display)" }}>Consent Network Requests</h3>
                <p className="muted-text" style={{ fontSize: "0.9rem", marginBottom: "8px" }}>Requests made by or targeting this member.</p>
                {timeline.accessRequests.length === 0 ? (
                  <EmptyState title="No consent requests" body="No request history found." />
                ) : (
                  <DataTable ariaLabel="Consent network requests" columns={accessColumns} data={timeline.accessRequests} />
                )}
              </Card>

              <Card className="stack" data-testid="timeline-consent-grants" style={{ overflow: "hidden" }}>
                <h3 style={{ fontFamily: "var(--font-display)" }}>Contact Sharing History</h3>
                <p className="muted-text" style={{ fontSize: "0.9rem", marginBottom: "8px" }}>Approvals showing who could view contact details and when.</p>
                {timeline.consentGrants.length === 0 ? (
                  <EmptyState title="No sharing approvals" body="No contact-sharing history found." />
                ) : (
                  <DataTable ariaLabel="Contact sharing approvals" columns={grantColumns} data={timeline.consentGrants} />
                )}
              </Card>
            </div>

            <Card className="stack" data-testid="timeline-audit-events" style={{ overflow: "hidden" }}>
              <h3 style={{ fontFamily: "var(--font-display)" }}>Core Audit Events</h3>
               <p className="muted-text" style={{ fontSize: "0.9rem", marginBottom: "8px" }}>Immutable timeline of system actions concerning this member.</p>
              {timeline.auditEvents.length === 0 ? (
                <EmptyState title="No audit events" body="No audit records were found." />
              ) : (
                <DataTable ariaLabel="Core audit events" columns={auditColumns} data={timeline.auditEvents} />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditPage(): React.JSX.Element {
  return (
    <PageShell>
      <RequireAdminSession>
        <AuditContent />
      </RequireAdminSession>
    </PageShell>
  );
}
