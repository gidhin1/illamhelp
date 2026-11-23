"use client";

import { contactShareStatus, formatUiError, validateStopSharingReason } from "@illamhelp/shared-types";
import { CheckboxInput } from "@illamhelp/ui-web";

import { ActionControl } from "@illamhelp/ui-web";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { PageShell } from "@/components/PageShell";
import { PersonSummary, personLabel } from "@/components/PersonSummary";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  SelectInput,
  Skeleton,
  StatusLabel,
  TextInput
} from "@/components/ui/primitives";
import {
  AccessRequestRecord,
  canViewConsent,
  ConnectionRecord,
  CONSENT_FIELDS,
  ConsentField,
  ConsentGrantRecord,
  formatDate,
  getProfileByUserId,
  grantConsent,
  listConnections,
  listConsentGrantsPage,
  listConsentRequestsPage,
  ProfileRecord,
  requestConsentAccess,
  revokeConsent
} from "@/lib/api";

type PrivacyView = "sharing" | "requests" | "ask" | "history";

function toggleFieldSelection(fields: ConsentField[], field: ConsentField): ConsentField[] {
  return fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
}

function toOptionalIsoString(localDateTime: string): string | undefined {
  if (!localDateTime.trim()) return undefined;
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

const CONSENT_FIELD_LABELS: Record<ConsentField, string> = {
  phone: "Phone number",
  alternate_phone: "Alternate phone",
  email: "Email address",
  full_address: "Home address"
};

export default function ConsentPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);
  const [requestsCursor, setRequestsCursor] = useState<string | null>(null);
  const [grantsCursor, setGrantsCursor] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [requestConnectionId, setRequestConnectionId] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestFields, setRequestFields] = useState<ConsentField[]>(["phone"]);

  const [grantRequestId, setGrantRequestId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantFields, setGrantFields] = useState<ConsentField[]>(["phone"]);

  const [revokeGrantId, setRevokeGrantId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const [checkConnectionId, setCheckConnectionId] = useState("");
  const [checkField, setCheckField] = useState<ConsentField>("phone");
  const [checkResult, setCheckResult] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<PrivacyView>("sharing");

  const [submitting, setSubmitting] = useState(false);

  const loadConsentData = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);
    try {
      const [requestPage, grantPage, connectionResult] = await Promise.all([
        listConsentRequestsPage(accessToken),
        listConsentGrantsPage(accessToken),
        listConnections(accessToken)
      ]);
      setRequests(requestPage.items);
      setRequestsCursor(requestPage.nextCursor);
      setGrants(grantPage.items);
      setGrantsCursor(grantPage.nextCursor);
      setConnections(connectionResult.items);
    } catch (requestError) {
      setListError(formatUiError(requestError, "Couldn’t load contact sharing. Refresh and try again."));
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  const loadMoreRequests = async (): Promise<void> => {
    if (!accessToken || !requestsCursor) return;
    const page = await listConsentRequestsPage(accessToken, requestsCursor);
    setRequests((previous) => [...previous, ...page.items]);
    setRequestsCursor(page.nextCursor);
  };

  const loadMoreGrants = async (): Promise<void> => {
    if (!accessToken || !grantsCursor || listLoading || submitting) return;
    setListLoading(true);
    setListError(null);
    try {
      const page = await listConsentGrantsPage(accessToken, grantsCursor);
      setGrants((previous) => [...previous, ...page.items]);
      setGrantsCursor(page.nextCursor);
    } catch (requestError) {
      setListError(formatUiError(requestError, "Couldn’t load more shares. Try again."));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadConsentData();
  }, [loadConsentData]);

  const currentUserId = user?.publicUserId ?? null;
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );
  
  const connectionPeople = useMemo(
    () =>
      acceptedConnections.map((connection) => {
        const memberId =
          connection.userAId === currentUserId ? connection.userBId : connection.userAId;
        return { connectionId: connection.id, memberId };
      }),
    [acceptedConnections, currentUserId]
  );

  useEffect(() => {
    if (!accessToken) return;
    const ids = Array.from(
      new Set([
        ...connectionPeople.map((connection) => connection.memberId),
        ...requests.flatMap((request) => [request.requesterUserId, request.ownerUserId]),
        ...grants.flatMap((grant) => [grant.ownerUserId, grant.granteeUserId])
      ])
    ).filter((userId) => userId && !profilesByUserId[userId]);
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
  }, [accessToken, connectionPeople, grants, profilesByUserId, requests]);

  const memberOptionLabel = useCallback(
    (userId: string): string => {
      const profile = profilesByUserId[userId];
      if (!profile) return `IllamHelp member (${userId})`;
      const location = profile ? [profile.city, profile.area].filter(Boolean).join(", ") : "";
      const context = [location, profile?.serviceCategories.slice(0, 1).join(", ")].filter(Boolean).join(" · ");
      return context ? `${personLabel(profile)} (${context})` : personLabel(profile);
    },
    [profilesByUserId]
  );

  const pendingIncomingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending" && request.ownerUserId === currentUserId),
    [requests, currentUserId]
  );

  const activeOwnedGrants = useMemo(
    () => grants.filter((grant) => contactShareStatus(grant, now) === "active" && grant.ownerUserId === currentUserId),
    [grants, currentUserId, now]
  );
  const activeSharedWithMe = useMemo(
    () => grants.filter((grant) => contactShareStatus(grant, now) === "active" && grant.granteeUserId === currentUserId),
    [grants, currentUserId, now]
  );
  const privacyViews = useMemo(
    () => [
      {
        key: "sharing" as const,
        label: "Shared by you",
        count: activeOwnedGrants.length
      },
      {
        key: "requests" as const,
        label: "Requests to you",
        count: pendingIncomingRequests.length
      },
      {
        key: "ask" as const,
        label: "Request details",
        count: activeSharedWithMe.length
      },
      {
        key: "history" as const,
        label: "History",
        count: requests.length + grants.length
      }
    ],
    [activeOwnedGrants.length, activeSharedWithMe.length, grants.length, pendingIncomingRequests.length, requests.length]
  );
  const selectedGrantRequest = useMemo(
    () => pendingIncomingRequests.find((request) => request.id === grantRequestId) ?? null,
    [pendingIncomingRequests, grantRequestId]
  );

  function fieldList(fields: ConsentField[]): string {
    return fields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ");
  }

  const withSubmission = async (action: () => Promise<void>, showError = setActionError): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await action();
    } catch (requestError) {
      showError(formatUiError(requestError, "Couldn’t update contact sharing. Check your selections and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    await withSubmission(async () => {
      const selectedConnection = connectionPeople.find((connection) => connection.connectionId === requestConnectionId);
      if (!selectedConnection) throw new Error("Select a connected person first.");
      const created = await requestConsentAccess(
        {
          ownerUserId: selectedConnection.memberId,
          connectionId: selectedConnection.connectionId,
          requestedFields: requestFields,
          purpose: requestPurpose.trim()
        },
        accessToken
      );
      setRequests((previous) => [created, ...previous]);
      setActionSuccess("Contact request sent.");
      setRequestPurpose("");
      setRequestConnectionId("");
    });
  };

  const onGrant = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    await withSubmission(async () => {
      const expiresAt = toOptionalIsoString(grantExpiresAt);
      if (grantExpiresAt.trim() && (!expiresAt || Date.parse(expiresAt) <= Date.now())) {
        throw new Error("Choose a future end date and time, or leave it blank.");
      }
      const grant = await grantConsent(
        grantRequestId.trim(),
        {
          grantedFields: grantFields,
          purpose: grantPurpose.trim(),
          expiresAt
        },
        accessToken
      );
      setGrants((previous) => [grant, ...previous]);
      setRequests((previous) =>
        previous.map((request) =>
          request.id === grant.accessRequestId ? { ...request, status: "approved" } : request
        )
      );
      setActionSuccess("Contact details shared.");
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
    });
  };

  const onRevoke = async (event: FormEvent<HTMLFormElement>, grant: ConsentGrantRecord): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    const validationError = validateStopSharingReason(revokeReason);
    setRevokeError(validationError);
    if (validationError) return;
    if (contactShareStatus(grant, Date.now()) !== "active") {
      setNow(Date.now());
      return;
    }
    await withSubmission(async () => {
      const updated = await revokeConsent(grant.id, { reason: revokeReason.trim() }, accessToken);
      setGrants((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setRevokeGrantId("");
      setRevokeReason("");
      setActionSuccess("Contact sharing stopped.");
    }, setRevokeError);
  };

  const onCanView = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    await withSubmission(async () => {
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === checkConnectionId
      );
      if (!selectedConnection) throw new Error("Select a connected person first.");
      const result = await canViewConsent(
        { ownerUserId: selectedConnection.memberId, field: checkField },
        accessToken
      );
      setCheckResult(result.allowed);
      setActionSuccess("Sharing check completed.");
    });
  };

  const requestColumns: ColumnDef<AccessRequestRecord>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusLabel tone="info">{row.original.status.replaceAll("_", " ")}</StatusLabel>,
    },
    {
      id: "parties",
      header: "People",
      cell: ({ row }) => (
        <div className="stack" style={{ gap: "8px" }}>
          <PersonSummary userId={row.original.requesterUserId} profile={profilesByUserId[row.original.requesterUserId]} compact />
          <span className="muted-text">asked to view details from</span>
          <PersonSummary userId={row.original.ownerUserId} profile={profilesByUserId[row.original.ownerUserId]} compact />
        </div>
      ),
    },
    {
      id: "fields",
      header: "Requested Details",
      cell: ({ row }) => row.original.requestedFields.map(f => CONSENT_FIELD_LABELS[f]).join(", "),
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.createdAt).split(",")[0],
    }
  ];

  const grantColumns: ColumnDef<ConsentGrantRecord>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusLabel tone="success">{contactShareStatus(row.original, now).replaceAll("_", " ")}</StatusLabel>,
    },
    {
      id: "parties",
      header: "People",
      cell: ({ row }) => (
        <div className="stack" style={{ gap: "8px" }}>
          <PersonSummary userId={row.original.granteeUserId} profile={profilesByUserId[row.original.granteeUserId]} compact />
          <span className="muted-text">can view details shared by</span>
          <PersonSummary userId={row.original.ownerUserId} profile={profilesByUserId[row.original.ownerUserId]} compact />
        </div>
      ),
    },
    {
      id: "fields",
      header: "Shared details",
      cell: ({ row }) => row.original.grantedFields.map(f => CONSENT_FIELD_LABELS[f]).join(", "),
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
    },
    {
      accessorKey: "grantedAt",
      header: "Shared",
      cell: ({ row }) => formatDate(row.original.grantedAt).split(",")[0],
    }
  ];

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            title="Contact sharing"
            subtitle="Request contact details from a connection, or choose what to share with them."
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadConsentData()}>
                Refresh
              </Button>
            }
          />
          <RequireSession>
            <div className="stack">
              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              {listError ? <Banner tone="error">{listError}</Banner> : null}

              <nav className="privacy-view-tabs" aria-label="Contact sharing tasks">
                {privacyViews.map((view) => {
                  const active = activeView === view.key;
                  return (
                    <ActionControl
                      key={view.key}
                      type="button"
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      disabled={submitting}
                      onClick={() => setActiveView(view.key)}
                    >
                      <span>{view.label}</span>
                      <strong>{view.count}</strong>
                    </ActionControl>
                  );
                })}
              </nav>

              {activeView === "sharing" ? (
              <div className="privacy-wallet-layout single">
                <Card variant="review" className="stack privacy-wallet-panel">
                  <div className="privacy-panel-header">
                    <div>
                      <h3>People who can see your details</h3>
                      <p className="muted-text">Stop sharing as soon as the visit or job is complete.</p>
                    </div>
                    <StatusLabel tone={activeOwnedGrants.length > 0 ? "warning" : "success"}>
                      {activeOwnedGrants.length > 0 ? "Active sharing" : "Shared by you"}
                    </StatusLabel>
                  </div>

                  {listLoading ? <Skeleton lines={3} /> : null}
                  {!listLoading && !listError && activeOwnedGrants.length === 0 ? (
                    <EmptyState
                      title={grantsCursor ? "No active shares in these results" : "No active contact shares"}
                      body={grantsCursor ? "Load more shares to check the rest." : "When you share contact details, you can review and stop access here."}
                    />
                  ) : null}
                  <div className="privacy-person-list" aria-label="Active contact sharing">
                    {activeOwnedGrants.map((grant) => (
                      <Card key={grant.id} as="article" variant="record" className="stack">
                        <PersonSummary userId={grant.granteeUserId} profile={profilesByUserId[grant.granteeUserId]} compact />
                        <p className="privacy-card-detail">Can see: {fieldList(grant.grantedFields)}</p>
                        <p className="privacy-card-detail">{grant.expiresAt ? `Ends ${formatDate(grant.expiresAt)}` : "Ends when you stop sharing"}</p>
                        {revokeGrantId === grant.id ? (
                          <form className="stack privacy-action-form" onSubmit={(event) => void onRevoke(event, grant)}>
                            <p>They’ll lose access to the details in this share.</p>
                            <Field label="Reason for stopping" hint="Enter at least 3 characters." error={revokeError}>
                              <TextInput value={revokeReason} onChange={(event) => { setRevokeReason(event.target.value); setRevokeError(null); }} readOnly={submitting} />
                            </Field>
                            <div className="job-mobile-actions">
                              <Button type="submit" variant="danger" disabled={submitting}>
                                {submitting ? "Stopping sharing..." : "Stop sharing"}
                              </Button>
                              <Button type="button" variant="ghost" disabled={submitting} onClick={() => setRevokeGrantId("")}>Keep sharing</Button>
                            </div>
                          </form>
                        ) : (
                          <div><Button type="button" variant="secondary" disabled={submitting} onClick={() => {
                            setRevokeGrantId(grant.id);
                            setRevokeReason("");
                            setRevokeError(null);
                          }}>Review and stop sharing</Button></div>
                        )}
                      </Card>
                    ))}
                  </div>
                  {grantsCursor ? (
                    <div><Button type="button" variant="secondary" disabled={listLoading || submitting} onClick={() => void loadMoreGrants()}>Load more shares</Button></div>
                  ) : null}
                </Card>
              </div>
              ) : null}

              {activeView === "requests" ? (
              <div className="privacy-wallet-layout single">
                <Card variant="review" className="stack privacy-wallet-panel">
                  <div className="privacy-panel-header">
                    <div>
                      <h3>Requests to see your details</h3>
                      <p className="muted-text">Approve only the details needed for the visit or job.</p>
                    </div>
                    <StatusLabel tone={pendingIncomingRequests.length > 0 ? "warning" : "success"}>
                      {pendingIncomingRequests.length} pending
                    </StatusLabel>
                  </div>

                  {pendingIncomingRequests.length === 0 ? (
                    <EmptyState title="No pending requests" body="When a connected person asks for contact details, you can approve or ignore it here." />
                  ) : (
                    <div className="privacy-person-list" aria-label="Pending contact detail requests">
                      {pendingIncomingRequests.map((request) => (
                        <ActionControl
                          key={request.id}
                          type="button"
                          className={`privacy-person-card ${grantRequestId === request.id ? "selected" : ""}`}
                          onClick={() => {
                            setGrantRequestId(request.id);
                            setGrantFields(request.requestedFields);
                            setGrantPurpose(request.purpose);
                          }}
                          aria-pressed={grantRequestId === request.id}
                        >
                          <PersonSummary userId={request.requesterUserId} profile={profilesByUserId[request.requesterUserId]} compact />
                          <span className="privacy-card-detail">Asking for: {fieldList(request.requestedFields)}</span>
                          <span className="privacy-card-detail">Reason: {request.purpose}</span>
                        </ActionControl>
                      ))}
                    </div>
                  )}

                  {pendingIncomingRequests.length > 0 ? (
                  <form className="stack privacy-action-form" onSubmit={onGrant}>
                    <Field label="Choose a request to approve" hint={selectedGrantRequest ? `Selected: ${personLabel(profilesByUserId[selectedGrantRequest.requesterUserId])}` : "Choose a pending request above or from this list."}>
                      <SelectInput value={grantRequestId} onChange={(e) => setGrantRequestId(e.target.value)} required>
                        <option value="">Select request...</option>
                        {pendingIncomingRequests.map((req) => (
                          <option key={req.id} value={req.id}>{memberOptionLabel(req.requesterUserId)} - {fieldList(req.requestedFields)}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why are you sharing?" hint="Explain why this person needs the details.">
                      <TextInput value={grantPurpose} onChange={(e) => setGrantPurpose(e.target.value)} placeholder="Approved for one-time visit coordination" required />
                    </Field>
                    <Field label="Access end date and time (optional)" hint="Leave blank to share until you stop access.">
                      <TextInput type="datetime-local" value={grantExpiresAt} onChange={(e) => setGrantExpiresAt(e.target.value)} />
                    </Field>
                    <fieldset className="check-fieldset">
                      <legend className="field-label">Details to share</legend>
                      <span className="field-hint">Only approve what this person needs.</span>
                      <div className="check-grid privacy-check-grid">
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} className="privacy-check-option">
                            <CheckboxInput type="checkbox" checked={grantFields.includes(field)} onChange={() => setGrantFields((prev) => toggleFieldSelection(prev, field))} />
                            <span>{CONSENT_FIELD_LABELS[field]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Button type="submit" disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}>
                      {submitting ? "Sharing details..." : "Share selected details"}
                    </Button>
                  </form>
                  ) : null}
                </Card>
              </div>
              ) : null}

              {activeView === "ask" ? (
              <Card variant="action" className="stack privacy-next-action">
                <div>
                  <h3>Request contact details</h3>
                  <p className="muted-text">Request only the details you need from a connection.</p>
                </div>
                <div className="privacy-request-grid">
                  <form className="stack" onSubmit={onRequestAccess}>
                    <Field label="Who" hint="Select the person whose details you need">
                      <SelectInput value={requestConnectionId} onChange={(e) => setRequestConnectionId(e.target.value)} required>
                        <option value="">Select connected person...</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>{memberOptionLabel(item.memberId)}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why" hint="Explain the reason for needing these details">
                      <TextInput value={requestPurpose} onChange={(e) => setRequestPurpose(e.target.value)} placeholder="e.g. Address for the visit" required minLength={3} />
                    </Field>
                    <fieldset className="check-fieldset">
                      <legend className="field-label">Details to request</legend>
                      <span className="field-hint">Details you need for the job or visit</span>
                      <div className="check-grid privacy-check-grid">
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} className="privacy-check-option">
                            <CheckboxInput type="checkbox" checked={requestFields.includes(field)} onChange={() => setRequestFields((prev) => toggleFieldSelection(prev, field))} />
                            <span>{CONSENT_FIELD_LABELS[field]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Button type="submit" disabled={submitting || requestFields.length === 0 || requestConnectionId.length === 0}>
                      {submitting ? "Sending request..." : "Request contact details"}
                    </Button>
                  </form>
                  <div className="privacy-helper-panel">
                    <strong>Before you request</strong>
                    <span>They choose which requested details to share and can stop sharing later.</span>
                  </div>
                </div>
                {activeSharedWithMe.length > 0 ? (
                  <div className="privacy-person-list">
                    <h4>People who shared with you</h4>
                    {activeSharedWithMe.map((grant) => (
                      <div key={grant.id} className="privacy-person-card readonly">
                        <PersonSummary userId={grant.ownerUserId} profile={profilesByUserId[grant.ownerUserId]} compact />
                        <span className="privacy-card-detail">Shared with you: {fieldList(grant.grantedFields)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
              ) : null}

              {activeView === "history" ? (
              <>
              <div className="grid two privacy-secondary-grid" style={{ alignItems: "start" }}>
                <Card variant="summary" className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Check if a detail is shared</h3>
                  <p className="muted-text" style={{ fontSize: "0.9rem" }}>Choose a person and a detail to check whether they’ve shared it with you.</p>
                  <form className="stack" onSubmit={onCanView}>
                    <Field label="Connected person">
                      <SelectInput value={checkConnectionId} onChange={(e) => setCheckConnectionId(e.target.value)} required>
                        <option value="">Select connection...</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>{memberOptionLabel(item.memberId)}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Contact detail">
                      <SelectInput value={checkField} onChange={(e) => setCheckField(e.target.value as ConsentField)}>
                        {CONSENT_FIELDS.map((field) => <option key={field} value={field}>{CONSENT_FIELD_LABELS[field]}</option>)}
                      </SelectInput>
                    </Field>
                    <Button type="submit" variant="ghost" disabled={submitting || checkConnectionId.length === 0}>
                      {submitting ? "Checking sharing..." : "Check access"}
                    </Button>
                    {checkResult !== null && (
                      <Banner tone={checkResult ? "success" : "info"}>
                        {checkResult ? "This person has shared this detail with you." : "This detail isn’t shared with you."}
                      </Banner>
                    )}
                  </form>
                </Card>
              </div>

              <div className="stack" style={{ gap: "var(--spacing-3xl)", marginTop: "var(--spacing-xl)" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Request history</h3>
                  {listLoading ? (
                    <Skeleton lines={3} />
                  ) : requests.length > 0 ? (
                    <>
                      <DataTable ariaLabel="Access requests" columns={requestColumns} data={requests} />
                      {requestsCursor ? (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--spacing-md)" }}>
                          <Button type="button" variant="secondary" onClick={() => void loadMoreRequests()}>Load more requests</Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <EmptyState title="No detail requests" body="Requests to share contact details will appear here." />
                  )}
                </div>

                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Sharing history</h3>
                  {listLoading ? (
                    <Skeleton lines={3} />
                  ) : grants.length > 0 ? (
                    <>
                      <DataTable ariaLabel="Contact sharing history" columns={grantColumns} data={grants} />
                      {grantsCursor ? (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--spacing-md)" }}>
                          <Button type="button" variant="secondary" onClick={() => void loadMoreGrants()}>Load more sharing history</Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <EmptyState title="No sharing history" body="Records of shared contact details will appear here." />
                  )}
                </div>
              </div>
              </>
              ) : null}

            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
