"use client";

import { FormEvent, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireAdminSession } from "@/components/session/RequireAdminSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
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
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchMemberTimeline(memberId, accessToken, 100);
      setTimeline(result);
    } catch (requestError) {
      setTimeline(null);
      setError(requestError instanceof Error ? requestError.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="container stack">
        <SectionHeader
          eyebrow="Privacy oversight"
          title="Consent + audit timeline"
          subtitle="Look up a member by public ID to inspect consent actions and related audit events."
        />

        <Card className="stack">
          <form className="stack" onSubmit={onSearch}>
            <Field
              label="Member ID"
              hint="Use the public member ID (for example: member_abc123 or chosen user ID)."
            >
              <TextInput
                data-testid="timeline-member-id"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                placeholder="Enter member ID"
                required
              />
            </Field>
            <div>
              <Button type="submit" data-testid="timeline-search" disabled={loading}>
                {loading ? "Searching..." : "Search timeline"}
              </Button>
            </div>
          </form>
          {error ? <Banner tone="error">{error}</Banner> : null}
        </Card>

        {!timeline && !loading ? (
          <EmptyState
            title="No member selected"
            body="Search for a member to view consent requests, grants, and audit history."
          />
        ) : null}

        {timeline ? (
          <>
            <Card className="stack" data-testid="timeline-member-summary">
              <h3>Member summary</h3>
              <div className="data-row">
                <div className="data-title">{timeline.member.publicUserId}</div>
                <div className="data-meta">Role: {timeline.member.role}</div>
                <div className="data-meta">Created: {formatDate(timeline.member.createdAt)}</div>
              </div>
            </Card>

            <div className="grid two">
              <Card className="stack" data-testid="timeline-access-requests">
                <h3>Consent requests</h3>
                {timeline.accessRequests.length === 0 ? (
                  <EmptyState
                    title="No consent requests"
                    body="No request history found for this member."
                  />
                ) : (
                  <div className="stack">
                    {timeline.accessRequests.map((item) => (
                      <div key={item.id} className="data-row">
                        <div className="data-title">
                          {item.requesterUserId} → {item.ownerUserId}
                        </div>
                        <div className="data-meta">Status: {item.status}</div>
                        <div className="data-meta">Fields: {item.requestedFields.join(", ")}</div>
                        <div className="data-meta">Purpose: {item.purpose}</div>
                        <div className="data-meta">Created: {formatDate(item.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="stack" data-testid="timeline-consent-grants">
                <h3>Consent grants</h3>
                {timeline.consentGrants.length === 0 ? (
                  <EmptyState
                    title="No consent grants"
                    body="No grant history found for this member."
                  />
                ) : (
                  <div className="stack">
                    {timeline.consentGrants.map((item) => (
                      <div key={item.id} className="data-row">
                        <div className="data-title">
                          {item.ownerUserId} → {item.granteeUserId}
                        </div>
                        <div className="data-meta">Status: {item.status}</div>
                        <div className="data-meta">Fields: {item.grantedFields.join(", ")}</div>
                        <div className="data-meta">Purpose: {item.purpose}</div>
                        <div className="data-meta">Granted: {formatDate(item.grantedAt)}</div>
                        {item.revokedAt ? (
                          <div className="data-meta">Revoked: {formatDate(item.revokedAt)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="stack" data-testid="timeline-audit-events">
              <h3>Audit events</h3>
              {timeline.auditEvents.length === 0 ? (
                <EmptyState
                  title="No audit events"
                  body="No audit events linked to this member were found."
                />
              ) : (
                <div className="stack">
                  {timeline.auditEvents.map((event) => (
                    <div key={event.id} className="data-row">
                      <div className="data-title">{event.eventType}</div>
                      <div className="data-meta">
                        Actors: {event.actorUserId ?? "system"} → {event.targetUserId ?? "n/a"}
                      </div>
                      {event.purpose ? <div className="data-meta">Purpose: {event.purpose}</div> : null}
                      <div className="data-meta">When: {formatDate(event.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </section>
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
