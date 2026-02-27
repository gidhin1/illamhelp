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
  TextInput
} from "@/components/ui/primitives";
import {
  acceptConnection,
  blockConnection,
  ConnectionSearchCandidate,
  ConnectionRecord,
  declineConnection,
  formatDate,
  listConnections,
  requestConnection,
  searchConnections
} from "@/lib/api";

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default function ConnectionsPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [targetQuery, setTargetQuery] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ConnectionSearchCandidate[]>([]);

  const [actionError, setActionError] = useState<string | null>(null);

  const loadConnections = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const records = await listConnections(accessToken);
      setConnections(records);
    } catch (requestErrorValue) {
      setListError(
        requestErrorValue instanceof Error
          ? requestErrorValue.message
          : "Unable to load connections"
      );
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const statusSummary = useMemo(() => {
    return connections.reduce<Record<string, number>>((acc, connection) => {
      acc[connection.status] = (acc[connection.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [connections]);

  const submitConnectionRequest = async (payload: {
    targetUserId?: string;
    targetQuery?: string;
  }): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const created = await requestConnection(payload, accessToken);
      setConnections((previous) => [created, ...previous]);
      setRequestSuccess("Connection request sent.");
      setTargetQuery("");
      setSearchResults([]);
    } catch (requestErrorValue) {
      setRequestError(
        requestErrorValue instanceof Error
          ? requestErrorValue.message
          : "Unable to request connection"
      );
    } finally {
      setRequestLoading(false);
    }
  };

  const onRequestConnection = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedQuery = targetQuery.trim();
    if (!normalizedQuery) {
      setRequestError("Enter a name, member ID, service, or location.");
      return;
    }

    const payload = looksLikeUuid(normalizedQuery)
      ? { targetUserId: normalizedQuery }
      : { targetQuery: normalizedQuery };
    await submitConnectionRequest(payload);
  };

  const onSearchConnections = async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const rows = await searchConnections({ q: targetQuery.trim(), limit: 8 }, accessToken);
      setSearchResults(rows);
    } catch (requestErrorValue) {
      setSearchError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to search"
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const onAccept = async (connectionId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setActionError(null);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await acceptConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((connection) => (connection.id === updated.id ? updated : connection))
      );
      setRequestSuccess("Connection accepted.");
    } catch (requestErrorValue) {
      setActionError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to accept"
      );
    }
  };

  const onDecline = async (connectionId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setActionError(null);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await declineConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((connection) => (connection.id === updated.id ? updated : connection))
      );
      setRequestSuccess("Connection request declined.");
    } catch (requestErrorValue) {
      setActionError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to decline"
      );
    }
  };

  const onBlock = async (connectionId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setActionError(null);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await blockConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((connection) => (connection.id === updated.id ? updated : connection))
      );
      setRequestSuccess("Person blocked.");
    } catch (requestErrorValue) {
      setActionError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to block"
      );
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="People"
            title="Connect with people you trust"
            subtitle="Search by name, member ID, service, or location."
            actions={
              <Button type="button" variant="ghost" onClick={() => void loadConnections()}>
                Refresh
              </Button>
            }
          />
          <RequireSession>
            <div className="stack">
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Total</div>
                  <div className="kpi-value">{connections.length}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Pending</div>
                  <div className="kpi-value">{statusSummary.pending ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Accepted</div>
                  <div className="kpi-value">{statusSummary.accepted ?? 0}</div>
                </div>
              </div>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Send a connection request</h3>
                {requestError ? <Banner tone="error">{requestError}</Banner> : null}
                {requestSuccess ? <Banner tone="success">{requestSuccess}</Banner> : null}
                {searchError ? <Banner tone="error">{searchError}</Banner> : null}
                <form onSubmit={onRequestConnection} className="grid two">
                  <Field
                    label="Find a person"
                    hint="Name, member ID, service type, location, or a mix of these."
                  >
                    <TextInput
                      value={targetQuery}
                      onChange={(event) => setTargetQuery(event.target.value)}
                      placeholder="e.g. Anita, plumber kochi, or member ID"
                      required
                    />
                  </Field>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={searchLoading || requestLoading}
                      onClick={() => void onSearchConnections()}
                    >
                      {searchLoading ? "Searching..." : "Search"}
                    </Button>
                    <Button type="submit" disabled={requestLoading}>
                      {requestLoading ? "Sending..." : "Send request"}
                    </Button>
                  </div>
                </form>
                {searchResults.length > 0 ? (
                  <div className="stack">
                    <h4 style={{ fontFamily: "var(--font-display)" }}>Matches</h4>
                    <div className="grid two">
                      {searchResults.map((candidate) => (
                        <Card key={candidate.userId} className="stack">
                          <div className="data-title">{candidate.displayName}</div>
                          <div className="data-meta">Member ID: {candidate.userId}</div>
                          {candidate.locationLabel ? (
                            <div className="data-meta">Location: {candidate.locationLabel}</div>
                          ) : null}
                          {candidate.serviceCategories.length > 0 ? (
                            <div className="data-meta">
                              Services: {candidate.serviceCategories.join(", ")}
                            </div>
                          ) : null}
                          {candidate.recentJobCategories.length > 0 ? (
                            <div className="data-meta">
                              Recent work: {candidate.recentJobCategories.join(", ")}
                            </div>
                          ) : null}
                          <div>
                            <Button
                              type="button"
                              disabled={requestLoading}
                              onClick={() =>
                                void submitConnectionRequest({ targetUserId: candidate.userId })
                              }
                            >
                              Connect
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Current connections</h3>
                {listError ? <Banner tone="error">{listError}</Banner> : null}
                {actionError ? <Banner tone="error">{actionError}</Banner> : null}
                {listLoading ? <p className="muted-text">Loading connections...</p> : null}
                {!listLoading && connections.length === 0 ? (
                  <EmptyState
                    title="No connections yet"
                    body="Send a request first, then wait for the other person to accept."
                  />
                ) : null}
                {!listLoading ? (
                  <div className="grid two">
                    {connections.map((connection) => {
                      const otherUserId =
                        connection.userAId === user?.userId
                          ? connection.userBId
                          : connection.userAId;
                      const canAccept =
                        connection.status === "pending" &&
                        connection.requestedByUserId !== user?.userId;
                      const canDecline = connection.status === "pending";
                      const canBlock = connection.status !== "blocked";
                      return (
                        <Card key={connection.id} className="stack">
                          <div className="pill">{connection.status}</div>
                          <div className="data-title">Connection ID: {connection.id}</div>
                          <div className="data-meta">Other user: {otherUserId}</div>
                          <div className="data-meta">
                            Requested by: {connection.requestedByUserId}
                          </div>
                          <div className="data-meta">
                            Requested at: {formatDate(connection.requestedAt)}
                          </div>
                          <div className="data-meta">
                            Decided at: {formatDate(connection.decidedAt)}
                          </div>
                          {canAccept ? (
                            <div>
                              <Button type="button" onClick={() => void onAccept(connection.id)}>
                                Accept connection
                              </Button>
                            </div>
                          ) : null}
                          {canDecline ? (
                            <div>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => void onDecline(connection.id)}
                              >
                                {connection.requestedByUserId === user?.userId
                                  ? "Withdraw request"
                                  : "Decline request"}
                              </Button>
                            </div>
                          ) : null}
                          {canBlock ? (
                            <div>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => void onBlock(connection.id)}
                              >
                                Block
                              </Button>
                            </div>
                          ) : null}
                        </Card>
                      );
                    })}
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
