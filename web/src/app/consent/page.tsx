"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  SelectInput,
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
  grantConsent,
  listConnections,
  listConsentGrants,
  listConsentRequests,
  requestConsentAccess,
  revokeConsent
} from "@/lib/api";

function toggleFieldSelection(fields: ConsentField[], field: ConsentField): ConsentField[] {
  return fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
}

function toOptionalIsoString(localDateTime: string): string | undefined {
  if (!localDateTime.trim()) {
    return undefined;
  }
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
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
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
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

  const [checkConnectionId, setCheckConnectionId] = useState("");
  const [checkField, setCheckField] = useState<ConsentField>("phone");
  const [checkResult, setCheckResult] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const loadConsentData = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
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
      setListError(
        requestError instanceof Error ? requestError.message : "Unable to load consent data"
      );
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConsentData();
  }, [loadConsentData]);

  const stats = useMemo(() => {
    const active = grants.filter((grant) => grant.status === "active").length;
    const pending = requests.filter((request) => request.status === "pending").length;
    return {
      requests: requests.length,
      grants: grants.length,
      active,
      pending
    };
  }, [grants, requests]);

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
        return {
          connectionId: connection.id,
          memberId
        };
      }),
    [acceptedConnections, currentUserId]
  );
  const pendingIncomingRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "pending" && request.ownerUserId === currentUserId
      ),
    [requests, currentUserId]
  );
  const activeOwnedGrants = useMemo(
    () =>
      grants.filter((grant) => grant.status === "active" && grant.ownerUserId === currentUserId),
    [grants, currentUserId]
  );

  const withSubmission = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await action();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Consent action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    await withSubmission(async () => {
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === requestConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Select a connected person first.");
      }
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
      setActionSuccess("Access request submitted.");
      setRequestPurpose("");
      setRequestConnectionId("");
    });
  };

  const onGrant = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
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
      setActionSuccess("Access granted.");
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
    });
  };

  const onRevoke = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    await withSubmission(async () => {
      const updated = await revokeConsent(
        revokeGrantId.trim(),
        { reason: revokeReason.trim() },
        accessToken
      );
      setGrants((previous) =>
        previous.map((grant) => (grant.id === updated.id ? updated : grant))
      );
      setActionSuccess("Access revoked.");
      setRevokeGrantId("");
      setRevokeReason("");
    });
  };

  const onCanView = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    await withSubmission(async () => {
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === checkConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Select a connected person first.");
      }
      const result = await canViewConsent(
        {
          ownerUserId: selectedConnection.memberId,
          field: checkField
        },
        accessToken
      );
      setCheckResult(result.allowed);
      setActionSuccess("Visibility check completed.");
    });
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Privacy"
            title="Share contact details safely"
            subtitle="You stay in control. Approve or stop sharing whenever you want."
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadConsentData()}>
                Refresh
              </Button>
            }
          />
          <RequireSession>
            <div className="stack">
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Access requests</div>
                  <div className="kpi-value">{stats.requests}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Pending</div>
                  <div className="kpi-value">{stats.pending}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Active grants</div>
                  <div className="kpi-value">{stats.active}</div>
                </div>
              </div>

              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              <div className="grid two">
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Request access</h3>
                  <form className="stack" onSubmit={onRequestAccess}>
                    <Field label="Choose person">
                      <SelectInput
                        value={requestConnectionId}
                        onChange={(event) => setRequestConnectionId(event.target.value)}
                        required
                      >
                        <option value="">Select a connected person</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>
                            {item.memberId}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why you need this">
                      <TextInput
                        value={requestPurpose}
                        onChange={(event) => setRequestPurpose(event.target.value)}
                        placeholder="Discuss cleaning schedule details"
                        required
                        minLength={3}
                      />
                    </Field>
                    <Field label="Details needed">
                      <div className="check-grid">
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} className="check-item">
                            <input
                              type="checkbox"
                              checked={requestFields.includes(field)}
                              onChange={() =>
                                setRequestFields((previous) =>
                                  toggleFieldSelection(previous, field)
                                )
                              }
                            />
                            {CONSENT_FIELD_LABELS[field]}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <div>
                      <Button
                        type="submit"
                        disabled={
                          submitting || requestFields.length === 0 || requestConnectionId.length === 0
                        }
                      >
                        {submitting ? "Submitting..." : "Request access"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Grant access</h3>
                  <form className="stack" onSubmit={onGrant}>
                    <Field label="Pending request">
                      <SelectInput
                        value={grantRequestId}
                        onChange={(event) => setGrantRequestId(event.target.value)}
                        required
                      >
                        <option value="">Select a pending request</option>
                        {pendingIncomingRequests.map((request) => (
                          <option key={request.id} value={request.id}>
                            {request.requesterUserId} - {request.requestedFields.join(", ")}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why you are approving">
                      <TextInput
                        value={grantPurpose}
                        onChange={(event) => setGrantPurpose(event.target.value)}
                        placeholder="Approved for one-time service call"
                        required
                      />
                    </Field>
                    <Field label="Ends on (optional)">
                      <TextInput
                        type="datetime-local"
                        value={grantExpiresAt}
                        onChange={(event) => setGrantExpiresAt(event.target.value)}
                      />
                    </Field>
                    <Field label="Details to share">
                      <div className="check-grid">
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} className="check-item">
                            <input
                              type="checkbox"
                              checked={grantFields.includes(field)}
                              onChange={() =>
                                setGrantFields((previous) =>
                                  toggleFieldSelection(previous, field)
                                )
                              }
                            />
                            {CONSENT_FIELD_LABELS[field]}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <div>
                      <Button
                        type="submit"
                        disabled={
                          submitting || grantFields.length === 0 || grantRequestId.length === 0
                        }
                      >
                        {submitting ? "Submitting..." : "Grant"}
                      </Button>
                    </div>
                  </form>
                </Card>
              </div>

              <div className="grid two">
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Stop sharing</h3>
                  <form className="stack" onSubmit={onRevoke}>
                    <Field label="Active share">
                      <SelectInput
                        value={revokeGrantId}
                        onChange={(event) => setRevokeGrantId(event.target.value)}
                        required
                      >
                        <option value="">Select an active share</option>
                        {activeOwnedGrants.map((grant) => (
                          <option key={grant.id} value={grant.id}>
                            {grant.granteeUserId} - {grant.grantedFields.join(", ")}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Reason">
                      <TextInput
                        value={revokeReason}
                        onChange={(event) => setRevokeReason(event.target.value)}
                        placeholder="No longer required"
                        required
                        minLength={3}
                      />
                    </Field>
                    <div>
                      <Button type="submit" variant="secondary" disabled={submitting}>
                        {submitting ? "Submitting..." : "Revoke"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Check shared access</h3>
                  <form className="stack" onSubmit={onCanView}>
                    <Field label="Choose person">
                      <SelectInput
                        value={checkConnectionId}
                        onChange={(event) => setCheckConnectionId(event.target.value)}
                        required
                      >
                        <option value="">Select a connected person</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>
                            {item.memberId}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Contact detail">
                      <SelectInput
                        value={checkField}
                        onChange={(event) => setCheckField(event.target.value as ConsentField)}
                      >
                        {CONSENT_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {CONSENT_FIELD_LABELS[field]}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <div>
                      <Button type="submit" disabled={submitting || checkConnectionId.length === 0}>
                        {submitting ? "Checking..." : "Check access"}
                      </Button>
                    </div>
                    {checkResult !== null ? (
                      <Banner tone={checkResult ? "success" : "info"}>
                        {checkResult ? "This contact detail is available to you." : "This contact detail is not available right now."}
                      </Banner>
                    ) : null}
                  </form>
                </Card>
              </div>

              <div className="grid two">
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Recent access requests</h3>
                  {listLoading ? <p className="muted-text">Loading requests...</p> : null}
                  {listError ? <Banner tone="error">{listError}</Banner> : null}
                  {!listLoading && requests.length === 0 ? (
                    <EmptyState
                      title="No access requests"
                      body="Requests will appear here after someone asks for your details."
                    />
                  ) : null}
                  {!listLoading ? (
                    <div className="stack">
                      {requests.map((request) => (
                        <div key={request.id} className="data-row">
                          <div className="data-title">{request.status}</div>
                          <div className="data-meta">
                            Requester: {request.requesterUserId} · Owner: {request.ownerUserId}
                          </div>
                          <div className="data-meta">
                            Details:{" "}
                            {request.requestedFields
                              .map((field) => CONSENT_FIELD_LABELS[field])
                              .join(", ")}
                          </div>
                          <div className="data-meta">Purpose: {request.purpose}</div>
                          <div className="field-hint">{formatDate(request.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Recent grants</h3>
                  {listLoading ? <p className="muted-text">Loading grants...</p> : null}
                  {listError ? <Banner tone="error">{listError}</Banner> : null}
                  {!listLoading && grants.length === 0 ? (
                    <EmptyState
                      title="No consent grants"
                      body="Granted records and revoked records are listed here."
                    />
                  ) : null}
                  {!listLoading ? (
                    <div className="stack">
                      {grants.map((grant) => (
                        <div key={grant.id} className="data-row">
                          <div className="data-title">{grant.status}</div>
                          <div className="data-meta">
                            Owner: {grant.ownerUserId} · Grantee: {grant.granteeUserId}
                          </div>
                          <div className="data-meta">
                            Details:{" "}
                            {grant.grantedFields
                              .map((field) => CONSENT_FIELD_LABELS[field])
                              .join(", ")}
                          </div>
                          <div className="data-meta">Purpose: {grant.purpose}</div>
                          <div className="field-hint">Granted at: {formatDate(grant.grantedAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </div>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
