"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { MemberAvatar } from "@/components/MemberAvatar";
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
  TextInput
} from "@/components/ui/primitives";
import {
  CONSENT_FIELDS,
  ConsentField,
  formatDate,
  grantConsent,
  listConnections,
  listConsentGrants,
  listConsentRequests,
  requestConsentAccess,
  revokeConsent,
  type AccessRequestRecord,
  type ConnectionRecord,
  type ConsentGrantRecord
} from "@/lib/api";

const CONSENT_FIELD_LABELS: Record<ConsentField, string> = {
  phone: "Phone",
  alternate_phone: "Alternate phone",
  email: "Email",
  full_address: "Full address"
};

type PrivacyTab = "current" | "mine" | "theirs" | "history";

function toggleFieldSelection(fields: ConsentField[], field: ConsentField): ConsentField[] {
  return fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
}

function toOptionalIsoString(localDateTime: string): string | undefined {
  if (!localDateTime.trim()) return undefined;
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function uniqueFieldCount(grants: ConsentGrantRecord[]): number {
  return new Set(grants.flatMap((grant) => grant.grantedFields)).size;
}

function buildFieldAccessRows(
  grantedToMe: ConsentGrantRecord[],
  grantedByMe: ConsentGrantRecord[]
): Array<{ field: ConsentField; iCanSee: boolean; theyCanSee: boolean }> {
  return CONSENT_FIELDS.map((field) => ({
    field,
    iCanSee: grantedToMe.some((grant) => grant.grantedFields.includes(field)),
    theyCanSee: grantedByMe.some((grant) => grant.grantedFields.includes(field))
  }));
}

function byNewest(
  left: AccessRequestRecord | ConsentGrantRecord,
  right: AccessRequestRecord | ConsentGrantRecord
): number {
  const leftDate = "createdAt" in left ? left.createdAt : left.grantedAt;
  const rightDate = "createdAt" in right ? right.createdAt : right.grantedAt;
  return new Date(rightDate).getTime() - new Date(leftDate).getTime();
}

export default function ConsentPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [activeTab, setActiveTab] = useState<PrivacyTab>("current");
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestFields, setRequestFields] = useState<ConsentField[]>(["phone"]);

  const [grantRequestId, setGrantRequestId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantFields, setGrantFields] = useState<ConsentField[]>(["phone"]);

  const [revokeGrantId, setRevokeGrantId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const loadConsentData = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);
    try {
      const [requestRows, grantRows, connectionResult] = await Promise.all([
        listConsentRequests(accessToken),
        listConsentGrants(accessToken),
        listConnections(accessToken)
      ]);
      setRequests(requestRows);
      setGrants(grantRows);
      setConnections(connectionResult.items);
    } catch (requestError) {
      setListError(requestError instanceof Error ? requestError.message : "Unable to load consent data");
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConsentData();
  }, [loadConsentData]);

  const currentUserId = user?.publicUserId ?? null;
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );

  const connectionCards = useMemo(
    () =>
      acceptedConnections.map((connection) => {
        const memberId =
          connection.otherUser?.userId ??
          (connection.userAId === currentUserId ? connection.userBId : connection.userAId);
        const displayName = connection.otherUser?.displayName ?? memberId;
        const personRequests = requests.filter((request) => request.connectionId === connection.id);
        const personGrants = grants.filter(
          (grant) => grant.connectionId === connection.id && grant.status === "active"
        );
        const grantedToMe = personGrants.filter((grant) => grant.granteeUserId === currentUserId);
        const grantedByMe = personGrants.filter((grant) => grant.ownerUserId === currentUserId);
        return {
          connection,
          connectionId: connection.id,
          memberId,
          displayName,
          visibleToMeCount: uniqueFieldCount(grantedToMe),
          visibleToThemCount: uniqueFieldCount(grantedByMe),
          pendingRequestCount: personRequests.filter((request) => request.status === "pending").length
        };
      }),
    [acceptedConnections, currentUserId, grants, requests]
  );

  const selectedConnection =
    connectionCards.find((item) => item.connectionId === selectedConnectionId) ?? null;

  const selectedRequests = useMemo(
    () =>
      requests
        .filter((request) => selectedConnection && request.connectionId === selectedConnection.connectionId)
        .sort(byNewest),
    [requests, selectedConnection]
  );

  const selectedGrants = useMemo(
    () =>
      grants
        .filter((grant) => selectedConnection && grant.connectionId === selectedConnection.connectionId)
        .sort(byNewest),
    [grants, selectedConnection]
  );

  const outgoingRequests = useMemo(
    () => selectedRequests.filter((request) => request.requesterUserId === currentUserId),
    [currentUserId, selectedRequests]
  );

  const incomingRequests = useMemo(
    () => selectedRequests.filter((request) => request.ownerUserId === currentUserId),
    [currentUserId, selectedRequests]
  );

  const pendingIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === "pending"),
    [incomingRequests]
  );

  const activeGrantedToMe = useMemo(
    () =>
      selectedGrants.filter(
        (grant) => grant.status === "active" && grant.granteeUserId === currentUserId
      ),
    [currentUserId, selectedGrants]
  );

  const activeGrantedByMe = useMemo(
    () =>
      selectedGrants.filter(
        (grant) => grant.status === "active" && grant.ownerUserId === currentUserId
      ),
    [currentUserId, selectedGrants]
  );

  const fieldAccessRows = useMemo(
    () => buildFieldAccessRows(activeGrantedToMe, activeGrantedByMe),
    [activeGrantedByMe, activeGrantedToMe]
  );

  const historyItems = useMemo(
    () =>
      [...selectedRequests, ...selectedGrants]
        .sort(byNewest)
        .map((item) => {
          if ("requestedFields" in item) {
            return {
              id: item.id,
              type: "request" as const,
              status: item.status,
              title:
                item.requesterUserId === currentUserId
                  ? "You requested access"
                  : `${selectedConnection?.displayName ?? "Connection"} requested access`,
              fields: item.requestedFields,
              purpose: item.purpose,
              date: item.createdAt
            };
          }

          return {
            id: item.id,
            type: "grant" as const,
            status: item.status,
            title:
              item.ownerUserId === currentUserId
                ? "You granted access"
                : `${selectedConnection?.displayName ?? "Connection"} granted access`,
            fields: item.grantedFields,
            purpose: item.purpose,
            date: item.grantedAt,
            revokedAt: item.revokedAt
          };
        }),
    [currentUserId, selectedConnection?.displayName, selectedGrants, selectedRequests]
  );

  const withSubmission = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await action();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Privacy action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !selectedConnection) return;
    await withSubmission(async () => {
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
      setRequestPurpose("");
      setActionSuccess("Access request submitted.");
      setActiveTab("mine");
    });
  };

  const onGrant = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    await withSubmission(async () => {
      const grant = await grantConsent(
        grantRequestId.trim(),
        {
          grantedFields: grantFields,
          purpose: grantPurpose.trim(),
          expiresAt: toOptionalIsoString(grantExpiresAt)
        },
        accessToken
      );
      setGrants((previous) => [grant, ...previous]);
      setRequests((previous) =>
        previous.map((request) =>
          request.id === grant.accessRequestId ? { ...request, status: "approved" } : request
        )
      );
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
      setActionSuccess("Access granted.");
      setActiveTab("current");
    });
  };

  const onRevoke = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) return;
    await withSubmission(async () => {
      const updated = await revokeConsent(
        revokeGrantId.trim(),
        { reason: revokeReason.trim() },
        accessToken
      );
      setGrants((previous) => previous.map((grant) => (grant.id === updated.id ? updated : grant)));
      setRevokeGrantId("");
      setRevokeReason("");
      setActionSuccess("Access revoked.");
      setActiveTab("history");
    });
  };

  const selectedPersonName = selectedConnection?.displayName ?? "Connection";
  const selectedAvatar = selectedConnection?.connection.otherUser?.avatar ?? null;

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Privacy"
            title={
              selectedConnection
                ? `Privacy with ${selectedPersonName}`
                : "Privacy organized by connection"
            }
            subtitle={
              selectedConnection
                ? "See current access both ways, review requests, and manage history without leaving this page."
                : "Start from a trusted connection card. Each person opens into a focused privacy workspace."
            }
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadConsentData()}>
                Refresh
              </Button>
            }
          />
          <RequireSession>
            <div className="stack">
              {listError ? <Banner tone="error">{listError}</Banner> : null}
              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Accepted connections</div>
                  <div className="kpi-value">{acceptedConnections.length}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Pending requests</div>
                  <div className="kpi-value">
                    {requests.filter((request) => request.status === "pending").length}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Active shares</div>
                  <div className="kpi-value">
                    {grants.filter((grant) => grant.status === "active").length}
                  </div>
                </div>
              </div>

              {!selectedConnection ? (
                <Card className="stack">
                  <div data-testid="privacy-card-grid" className="stack" style={{ gap: "16px" }}>
                    <div className="stack" style={{ gap: "6px" }}>
                      <h3 style={{ fontFamily: "var(--font-display)" }}>Connected people</h3>
                      <p className="muted-text">
                        Pick a connection to open their field-level privacy view and request history.
                      </p>
                    </div>
                    {connectionCards.length === 0 ? (
                      <EmptyState
                        title="No privacy relationships yet"
                        body="Accepted connections will appear here with summaries of granted and requested access."
                      />
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: "16px"
                        }}
                      >
                      {connectionCards.map((item) => (
                        <button
                          key={item.connectionId}
                          type="button"
                          onClick={() => {
                            setSelectedConnectionId(item.connectionId);
                            setActiveTab("current");
                            setGrantRequestId("");
                            setRevokeGrantId("");
                          }}
                          data-testid={`privacy-connection-card-${item.memberId}`}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "block"
                          }}
                        >
                          <Card
                            soft
                            className="stack"
                            style={{
                              gap: "14px",
                              height: "100%",
                              transition: "transform 0.18s ease, border-color 0.18s ease",
                              borderColor: "color-mix(in srgb, var(--brand) 12%, var(--line))"
                            }}
                          >
                            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                              <MemberAvatar
                                name={item.displayName}
                                avatar={item.connection.otherUser?.avatar ?? null}
                              />
                              <div className="stack" style={{ gap: "4px", flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>{item.displayName}</div>
                                <div className="muted-text">{item.memberId}</div>
                                <div className="muted-text">
                                  {item.connection.otherUser?.locationLabel ?? "Location not set"}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                gap: "10px"
                              }}
                            >
                              <Card soft style={{ padding: "12px" }}>
                                <div className="muted-text" style={{ fontSize: "0.8rem" }}>
                                  I can see
                                </div>
                                <div style={{ fontWeight: 800, fontSize: "1.25rem" }}>
                                  {item.visibleToMeCount}
                                </div>
                              </Card>
                              <Card soft style={{ padding: "12px" }}>
                                <div className="muted-text" style={{ fontSize: "0.8rem" }}>
                                  They can see
                                </div>
                                <div style={{ fontWeight: 800, fontSize: "1.25rem" }}>
                                  {item.visibleToThemCount}
                                </div>
                              </Card>
                              <Card soft style={{ padding: "12px" }}>
                                <div className="muted-text" style={{ fontSize: "0.8rem" }}>
                                  Pending
                                </div>
                                <div style={{ fontWeight: 800, fontSize: "1.25rem" }}>
                                  {item.pendingRequestCount}
                                </div>
                              </Card>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "10px"
                              }}
                            >
                              <div className="muted-text">
                                {(item.connection.otherUser?.topSkills ?? []).slice(0, 2).join(" · ") ||
                                  "No skills listed yet"}
                              </div>
                              <span className="pill">Open details</span>
                            </div>
                          </Card>
                        </button>
                      ))}
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                <div className="stack" data-testid="privacy-detail-view">
                  <Card className="stack" style={{ gap: "18px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "16px",
                        alignItems: "start",
                        flexWrap: "wrap"
                      }}
                    >
                      <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
                        <MemberAvatar
                          name={selectedPersonName}
                          avatar={selectedAvatar}
                          size={88}
                          style={{ border: "4px solid rgba(255,255,255,0.9)" }}
                        />
                        <div className="stack" style={{ gap: "6px" }}>
                          <div className="pill" style={{ width: "fit-content" }}>
                            Privacy detail
                          </div>
                          <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{selectedPersonName}</div>
                          <div className="muted-text">Member ID: {selectedConnection.memberId}</div>
                          <div className="muted-text">
                            {selectedConnection.connection.otherUser?.locationLabel ?? "Location not set"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setSelectedConnectionId("");
                            setActiveTab("current");
                          }}
                        >
                          Back to connections
                        </Button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap"
                      }}
                    >
                      {[
                        { key: "current", label: "Current access" },
                        { key: "mine", label: "My requests" },
                        { key: "theirs", label: "Their requests" },
                        { key: "history", label: "History" }
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key as PrivacyTab)}
                          data-testid={`privacy-tab-${tab.key}`}
                          className={activeTab === tab.key ? "button" : "button secondary"}
                          style={{ minWidth: "160px" }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </Card>

                  {activeTab === "current" ? (
                    <Card className="stack">
                      <div className="stack" style={{ gap: "6px" }}>
                        <h3 style={{ fontFamily: "var(--font-display)" }}>Current field access</h3>
                        <p className="muted-text">
                          A simple two-way view of what is visible right now between you and this connection.
                        </p>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "separate",
                            borderSpacing: "0 10px"
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "0 12px 0 0" }}>Field</th>
                              <th style={{ textAlign: "left", padding: "0 12px" }}>I can see</th>
                              <th style={{ textAlign: "left", padding: "0 12px" }}>They can see</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fieldAccessRows.map((row) => (
                              <tr key={row.field} data-testid={`privacy-field-row-${row.field}`}>
                                <td style={{ padding: "14px 12px 14px 0", fontWeight: 700 }}>
                                  {CONSENT_FIELD_LABELS[row.field]}
                                </td>
                                <td style={{ padding: "14px 12px" }}>
                                  <span className="pill">{row.iCanSee ? "Visible" : "Not shared"}</span>
                                </td>
                                <td style={{ padding: "14px 12px" }}>
                                  <span className="pill">{row.theyCanSee ? "Visible" : "Not shared"}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid two" style={{ alignItems: "start" }}>
                        <Card soft>
                          <div className="stack" style={{ gap: "6px" }}>
                            <div style={{ fontWeight: 700 }}>You can currently see</div>
                            <div className="muted-text">
                              {activeGrantedToMe.length === 0
                                ? "No active fields are visible from this person yet."
                                : activeGrantedToMe
                                    .flatMap((grant) => grant.grantedFields)
                                    .map((field) => CONSENT_FIELD_LABELS[field])
                                    .filter((value, index, list) => list.indexOf(value) === index)
                                    .join(", ")}
                            </div>
                          </div>
                        </Card>
                        <Card soft>
                          <div className="stack" style={{ gap: "6px" }}>
                            <div style={{ fontWeight: 700 }}>They can currently see</div>
                            <div className="muted-text">
                              {activeGrantedByMe.length === 0
                                ? "You have not granted any active fields to this person."
                                : activeGrantedByMe
                                    .flatMap((grant) => grant.grantedFields)
                                    .map((field) => CONSENT_FIELD_LABELS[field])
                                    .filter((value, index, list) => list.indexOf(value) === index)
                                    .join(", ")}
                            </div>
                          </div>
                        </Card>
                      </div>
                    </Card>
                  ) : null}

                  {activeTab === "mine" ? (
                    <div className="grid two" style={{ alignItems: "start" }}>
                      <Card className="stack">
                        <div className="stack" style={{ gap: "6px" }}>
                          <h3 style={{ fontFamily: "var(--font-display)" }}>Ask {selectedPersonName} for access</h3>
                          <p className="muted-text">
                            Request only the fields you need. Pending and past statuses stay visible below.
                          </p>
                        </div>
                        <form className="stack" onSubmit={onRequestAccess}>
                          <Field label="Purpose" hint="Explain why you need these details from this person.">
                            <TextInput
                              value={requestPurpose}
                              onChange={(e) => setRequestPurpose(e.target.value)}
                              data-testid="privacy-request-purpose"
                            />
                          </Field>
                          <div className="stack" style={{ gap: "8px" }}>
                            <div className="field-label">Requested fields</div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {CONSENT_FIELDS.map((field) => {
                                const selected = requestFields.includes(field);
                                return (
                                  <button
                                    key={field}
                                    type="button"
                                    className={selected ? "button secondary" : "button ghost"}
                                    onClick={() =>
                                      setRequestFields((previous) =>
                                        toggleFieldSelection(previous, field)
                                      )
                                    }
                                    data-testid={`privacy-request-field-${field}`}
                                  >
                                    {CONSENT_FIELD_LABELS[field]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <Button type="submit" disabled={submitting || requestFields.length === 0}>
                            Request access
                          </Button>
                        </form>
                      </Card>

                      <Card className="stack">
                        <h3 style={{ fontFamily: "var(--font-display)" }}>My request status</h3>
                        {outgoingRequests.length === 0 ? (
                          <EmptyState
                            title="No requests sent yet"
                            body="When you request access from this person, the status will appear here."
                          />
                        ) : (
                          <div className="stack">
                            {outgoingRequests.map((request) => (
                              <Card key={request.id} soft data-testid={`privacy-my-request-${request.id}`}>
                                <div className="stack" style={{ gap: "8px" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: "12px",
                                      flexWrap: "wrap"
                                    }}
                                  >
                                    <div style={{ fontWeight: 700 }}>
                                      {request.requestedFields
                                        .map((field) => CONSENT_FIELD_LABELS[field])
                                        .join(", ")}
                                    </div>
                                    <span className="pill">{request.status}</span>
                                  </div>
                                  <div className="muted-text">Purpose: {request.purpose || "Not provided"}</div>
                                  <div className="muted-text">Requested {formatDate(request.createdAt)}</div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  ) : null}

                  {activeTab === "theirs" ? (
                    <div className="grid two" style={{ alignItems: "start" }}>
                      <Card className="stack">
                        <div className="stack" style={{ gap: "6px" }}>
                          <h3 style={{ fontFamily: "var(--font-display)" }}>Requests from {selectedPersonName}</h3>
                          <p className="muted-text">
                            Pending requests can be granted here. Past requests stay listed with their status.
                          </p>
                        </div>
                        {incomingRequests.length === 0 ? (
                          <EmptyState
                            title="No requests from this person"
                            body="If they ask for access, the request and its status will appear here."
                          />
                        ) : (
                          <div className="stack">
                            {incomingRequests.map((request) => (
                              <button
                                key={request.id}
                                type="button"
                                onClick={() => {
                                  setGrantRequestId(request.id);
                                  setGrantPurpose(request.purpose);
                                  setGrantFields(request.requestedFields);
                                }}
                                data-testid={`privacy-their-request-${request.id}`}
                                style={{ all: "unset", cursor: "pointer", display: "block" }}
                              >
                                <Card
                                  soft
                                  style={{
                                    borderColor:
                                      request.id === grantRequestId
                                        ? "var(--brand)"
                                        : "var(--line)"
                                  }}
                                >
                                  <div className="stack" style={{ gap: "8px" }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        flexWrap: "wrap"
                                      }}
                                    >
                                      <div style={{ fontWeight: 700 }}>
                                        {request.requestedFields
                                          .map((field) => CONSENT_FIELD_LABELS[field])
                                          .join(", ")}
                                      </div>
                                      <span className="pill">{request.status}</span>
                                    </div>
                                    <div className="muted-text">
                                      Purpose: {request.purpose || "Not provided"}
                                    </div>
                                    <div className="muted-text">
                                      Requested {formatDate(request.createdAt)}
                                    </div>
                                  </div>
                                </Card>
                              </button>
                            ))}
                          </div>
                        )}

                        {pendingIncomingRequests.length > 0 ? (
                          <form className="stack" onSubmit={onGrant}>
                            <Field label="Grant purpose">
                              <TextInput
                                value={grantPurpose}
                                onChange={(e) => setGrantPurpose(e.target.value)}
                              />
                            </Field>
                            <Field label="Expires at (optional)">
                              <TextInput
                                type="datetime-local"
                                value={grantExpiresAt}
                                onChange={(e) => setGrantExpiresAt(e.target.value)}
                              />
                            </Field>
                            <div className="stack" style={{ gap: "8px" }}>
                              <div className="field-label">Grant these fields</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {CONSENT_FIELDS.map((field) => {
                                  const selected = grantFields.includes(field);
                                  return (
                                    <button
                                      key={field}
                                      type="button"
                                      className={selected ? "button secondary" : "button ghost"}
                                      onClick={() =>
                                        setGrantFields((previous) =>
                                          toggleFieldSelection(previous, field)
                                        )
                                      }
                                      data-testid={`privacy-grant-field-${field}`}
                                    >
                                      {CONSENT_FIELD_LABELS[field]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <Button
                              type="submit"
                              disabled={submitting || !grantRequestId || grantFields.length === 0}
                            >
                              Grant access
                            </Button>
                          </form>
                        ) : null}
                      </Card>

                      <Card className="stack">
                        <h3 style={{ fontFamily: "var(--font-display)" }}>What they can currently see</h3>
                        {activeGrantedByMe.length === 0 ? (
                          <EmptyState
                            title="No active grants to revoke"
                            body="Once you share fields with this person, they will appear here."
                          />
                        ) : (
                          <>
                            <div className="stack">
                              {activeGrantedByMe.map((grant) => (
                                <button
                                  key={grant.id}
                                  type="button"
                                  onClick={() => setRevokeGrantId(grant.id)}
                                  data-testid={`privacy-revoke-grant-${grant.id}`}
                                  style={{ all: "unset", cursor: "pointer", display: "block" }}
                                >
                                  <Card
                                    soft
                                    style={{
                                      borderColor:
                                        grant.id === revokeGrantId
                                          ? "var(--brand)"
                                          : "var(--line)"
                                    }}
                                  >
                                    <div className="stack" style={{ gap: "8px" }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: "12px",
                                          flexWrap: "wrap"
                                        }}
                                      >
                                        <div style={{ fontWeight: 700 }}>
                                          {grant.grantedFields
                                            .map((field) => CONSENT_FIELD_LABELS[field])
                                            .join(", ")}
                                        </div>
                                        <span className="pill">{grant.status}</span>
                                      </div>
                                      <div className="muted-text">
                                        Purpose: {grant.purpose || "Not provided"}
                                      </div>
                                      <div className="muted-text">
                                        Expires:{" "}
                                        {grant.expiresAt ? formatDate(grant.expiresAt) : "No expiry"}
                                      </div>
                                    </div>
                                  </Card>
                                </button>
                              ))}
                            </div>
                            <form className="stack" onSubmit={onRevoke}>
                              <Field label="Revoke reason (optional)">
                                <TextInput
                                  value={revokeReason}
                                  onChange={(e) => setRevokeReason(e.target.value)}
                                />
                              </Field>
                              <Button
                                type="submit"
                                variant="secondary"
                                disabled={submitting || !revokeGrantId}
                              >
                                Revoke selected grant
                              </Button>
                            </form>
                          </>
                        )}
                      </Card>
                    </div>
                  ) : null}

                  {activeTab === "history" ? (
                    <Card className="stack">
                      <div className="stack" style={{ gap: "6px" }}>
                        <h3 style={{ fontFamily: "var(--font-display)" }}>History with {selectedPersonName}</h3>
                        <p className="muted-text">
                          A single timeline for both requests and grants between you and this person.
                        </p>
                      </div>
                      {historyItems.length === 0 ? (
                        <EmptyState
                          title="No privacy history yet"
                          body="Requests, approvals, and revocations with this person will appear here."
                        />
                      ) : (
                        <div className="stack">
                          {historyItems.map((item) => (
                            <Card key={`${item.type}-${item.id}`} soft>
                              <div className="stack" style={{ gap: "8px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "12px",
                                    flexWrap: "wrap"
                                  }}
                                >
                                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                                  <span className="pill">{item.status}</span>
                                </div>
                                <div className="muted-text">
                                  {item.fields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
                                </div>
                                <div className="muted-text">Purpose: {item.purpose || "Not provided"}</div>
                                <div className="muted-text">{formatDate(item.date)}</div>
                                {"revokedAt" in item && item.revokedAt ? (
                                  <div className="muted-text">
                                    Revoked {formatDate(item.revokedAt)}
                                  </div>
                                ) : null}
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </Card>
                  ) : null}
                </div>
              )}

              {listLoading ? <div className="muted-text">Loading privacy connections...</div> : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
