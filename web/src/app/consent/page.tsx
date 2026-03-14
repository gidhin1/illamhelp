"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { PageShell } from "@/components/PageShell";
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
        return { connectionId: connection.id, memberId };
      }),
    [acceptedConnections, currentUserId]
  );

  const pendingIncomingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending" && request.ownerUserId === currentUserId),
    [requests, currentUserId]
  );

  const activeOwnedGrants = useMemo(
    () => grants.filter((grant) => grant.status === "active" && grant.ownerUserId === currentUserId),
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
      setActionSuccess("Access request submitted.");
      setRequestPurpose("");
      setRequestConnectionId("");
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
      setActionSuccess("Access granted.");
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
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
      setActionSuccess("Visibility check completed.");
    });
  };

  const requestColumns: ColumnDef<AccessRequestRecord>[] = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.status}</span>,
    },
    {
      id: "parties",
      header: "Parties",
      cell: ({ row }) => `${row.original.requesterUserId} (req) → ${row.original.ownerUserId} (own)`,
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
      cell: ({ row }) => <span className="pill">{row.original.status}</span>,
    },
    {
      id: "parties",
      header: "Parties",
      cell: ({ row }) => `${row.original.granteeUserId} (has access) ← ${row.original.ownerUserId}`,
    },
    {
      id: "fields",
      header: "Granted Details",
      cell: ({ row }) => row.original.grantedFields.map(f => CONSENT_FIELD_LABELS[f]).join(", "),
    },
    {
      accessorKey: "purpose",
      header: "Purpose",
    },
    {
      accessorKey: "grantedAt",
      header: "Granted",
      cell: ({ row }) => formatDate(row.original.grantedAt).split(",")[0],
    }
  ];

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Privacy Settings"
            title="Manage Information Access"
            subtitle="Grant or revoke access to your private contact details securely."
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
                  <div className="kpi-label">Access reqs</div>
                  <div className="kpi-value">{stats.requests}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Pending reqs</div>
                  <div className="kpi-value">{stats.pending}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Active grants</div>
                  <div className="kpi-value">{stats.active}</div>
                </div>
              </div>

              {actionError ? <Banner tone="error">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              <div className="grid two" style={{ alignItems: "start" }}>
                <Card className="stack" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Request Access</h3>
                  <form className="stack" onSubmit={onRequestAccess}>
                    <Field label="Who" hint="Select the person whose details you need">
                      <SelectInput value={requestConnectionId} onChange={(e) => setRequestConnectionId(e.target.value)} required>
                        <option value="">Select connection...</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>{item.memberId}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why" hint="Explain the reason for needing these details">
                      <TextInput value={requestPurpose} onChange={(e) => setRequestPurpose(e.target.value)} placeholder="Need address to arrive" required minLength={3} />
                    </Field>
                    <Field label="What" hint="Fields you need visibility into">
                      <div className="check-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "5px" }}>
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                            <input type="checkbox" checked={requestFields.includes(field)} onChange={() => setRequestFields((prev) => toggleFieldSelection(prev, field))} />
                            <span style={{ fontSize: "0.9rem" }}>{CONSENT_FIELD_LABELS[field]}</span>
                          </label>
                        ))}
                      </div>
                    </Field>
                    <div style={{ marginTop: "10px" }}>
                      <Button type="submit" disabled={submitting || requestFields.length === 0 || requestConnectionId.length === 0}>
                        {submitting ? "Sending..." : "Send Request"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="stack" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Grant Access</h3>
                  <form className="stack" onSubmit={onGrant}>
                    <Field label="Pending Request" hint="Select an incoming request to approve">
                      <SelectInput value={grantRequestId} onChange={(e) => setGrantRequestId(e.target.value)} required>
                        <option value="">Select request...</option>
                        {pendingIncomingRequests.map((req) => (
                          <option key={req.id} value={req.id}>{req.requesterUserId} - {req.requestedFields.join(", ")}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Why" hint="Reason for your approval">
                      <TextInput value={grantPurpose} onChange={(e) => setGrantPurpose(e.target.value)} placeholder="Approved for visit" required />
                    </Field>
                    <Field label="Expires On (optional)">
                      <TextInput type="datetime-local" value={grantExpiresAt} onChange={(e) => setGrantExpiresAt(e.target.value)} />
                    </Field>
                    <Field label="What" hint="The exact fields you are sharing">
                      <div className="check-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "5px" }}>
                        {CONSENT_FIELDS.map((field) => (
                          <label key={field} style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                            <input type="checkbox" checked={grantFields.includes(field)} onChange={() => setGrantFields((prev) => toggleFieldSelection(prev, field))} />
                            <span style={{ fontSize: "0.9rem" }}>{CONSENT_FIELD_LABELS[field]}</span>
                          </label>
                        ))}
                      </div>
                    </Field>
                    <div style={{ marginTop: "10px" }}>
                      <Button type="submit" disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}>
                        {submitting ? "Processing..." : "Grant Details"}
                      </Button>
                    </div>
                  </form>
                </Card>
              </div>

              <div className="grid two" style={{ alignItems: "start" }}>
                <Card className="stack" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <h3 style={{ fontFamily: "var(--font-display)", color: "var(--error)" }}>Revoke Access</h3>
                  <p className="muted-text" style={{ fontSize: "0.9rem" }}>Immediately withdraw prior sharing permissions.</p>
                  <form className="stack" onSubmit={onRevoke}>
                    <Field label="Active Permission">
                      <SelectInput value={revokeGrantId} onChange={(e) => setRevokeGrantId(e.target.value)} required>
                        <option value="">Select active grant...</option>
                        {activeOwnedGrants.map((grant) => (
                          <option key={grant.id} value={grant.id}>{grant.granteeUserId} - {grant.grantedFields.join(", ")}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Reason">
                      <TextInput value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Service completed" required minLength={3} />
                    </Field>
                    <div style={{ marginTop: "10px" }}>
                      <Button type="submit" variant="secondary" disabled={submitting || revokeGrantId.length === 0}>
                        {submitting ? "Revoking..." : "Revoke"}
                      </Button>
                    </div>
                  </form>
                </Card>

                <Card className="stack" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Verify Sharing Status</h3>
                  <form className="stack" onSubmit={onCanView}>
                    <Field label="Who">
                      <SelectInput value={checkConnectionId} onChange={(e) => setCheckConnectionId(e.target.value)} required>
                        <option value="">Select connection...</option>
                        {connectionPeople.map((item) => (
                          <option key={item.connectionId} value={item.connectionId}>{item.memberId}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Contact Field">
                      <SelectInput value={checkField} onChange={(e) => setCheckField(e.target.value as ConsentField)}>
                        {CONSENT_FIELDS.map((field) => <option key={field} value={field}>{CONSENT_FIELD_LABELS[field]}</option>)}
                      </SelectInput>
                    </Field>
                    <div style={{ marginTop: "10px" }}>
                      <Button type="submit" variant="ghost" disabled={submitting || checkConnectionId.length === 0}>
                        {submitting ? "Checking..." : "Verify Access"}
                      </Button>
                    </div>
                    {checkResult !== null && (
                      <div style={{ marginTop: "10px" }}>
                        <Banner tone={checkResult ? "success" : "info"}>
                          {checkResult ? "Yes, this field is visible to you." : "No, this field is hidden."}
                        </Banner>
                      </div>
                    )}
                  </form>
                </Card>
              </div>

              <div className="stack" style={{ gap: "var(--spacing-3xl)", marginTop: "var(--spacing-xl)" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Log: Access Requests</h3>
                  {listError ? <Banner tone="error">{listError}</Banner> : null}
                  {listLoading ? (
                    <p className="muted-text">Loading...</p>
                  ) : requests.length > 0 ? (
                    <DataTable columns={requestColumns} data={requests} />
                  ) : (
                    <EmptyState title="No access requests" body="Network data sharing requests will appear here." />
                  )}
                </div>

                <div>
                  <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Log: Detailed Sharing Grants</h3>
                  {listError ? <Banner tone="error">{listError}</Banner> : null}
                  {listLoading ? (
                    <p className="muted-text">Loading...</p>
                  ) : grants.length > 0 ? (
                    <DataTable columns={grantColumns} data={grants} />
                  ) : (
                    <EmptyState title="No sharing events" body="Records of sharing access will appear here." />
                  )}
                </div>
              </div>

            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
