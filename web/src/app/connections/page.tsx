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
  acceptConnection,
  blockConnection,
  ConnectionRecord,
  declineConnection,
  discoverConnections,
  listConnections,
  requestConnection,
  searchConnections,
  type ConnectionSearchCandidate
} from "@/lib/api";

function personIdFromConnection(connection: ConnectionRecord, currentUserId?: string): string {
  if (connection.otherUser?.userId) {
    return connection.otherUser.userId;
  }
  return connection.userAId === currentUserId ? connection.userBId : connection.userAId;
}

export default function ConnectionsPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [activeTab, setActiveTab] = useState<"discover" | "connections">("discover");
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [discoverPeople, setDiscoverPeople] = useState<ConnectionSearchCandidate[]>([]);
  const [searchResults, setSearchResults] = useState<ConnectionSearchCandidate[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [targetQuery, setTargetQuery] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadConnections = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);
    try {
      const result = await listConnections(accessToken);
      setConnections(result.items);
    } catch (requestErrorValue) {
      setListError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to load connections"
      );
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  const loadDiscover = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setDiscoverLoading(true);
    setSearchError(null);
    try {
      const rows = await discoverConnections(accessToken, { limit: 8 });
      setDiscoverPeople(rows);
    } catch (requestErrorValue) {
      setSearchError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to load discover people"
      );
    } finally {
      setDiscoverLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.all([loadConnections(), loadDiscover()]);
  }, [loadConnections, loadDiscover]);

  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );
  const pendingConnections = useMemo(
    () => connections.filter((connection) => connection.status === "pending"),
    [connections]
  );

  const submitConnectionRequest = async (payload: { targetUserId?: string; targetQuery?: string }): Promise<void> => {
    if (!accessToken) return;
    setRequestLoading(true);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const created = await requestConnection(payload, accessToken);
      setConnections((previous) => {
        const withoutSameId = previous.filter((connection) => connection.id !== created.id);
        return [created, ...withoutSameId];
      });
      setRequestSuccess("Connection request sent.");
      setTargetQuery("");
      await loadDiscover();
    } catch (requestErrorValue) {
      setRequestError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to request connection"
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
    await submitConnectionRequest({ targetQuery: normalizedQuery });
  };

  const onSearchConnections = async (): Promise<void> => {
    if (!accessToken) return;
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

  const updateConnection = (updated: ConnectionRecord): void => {
    setConnections((previous) => previous.map((connection) => (connection.id === updated.id ? updated : connection)));
  };

  const onAccept = async (connectionId: string): Promise<void> => {
    if (!accessToken) return;
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await acceptConnection(connectionId, accessToken);
      updateConnection(updated);
      setRequestSuccess("Connection accepted.");
    } catch (requestErrorValue) {
      setRequestError(requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to accept");
    }
  };

  const onDecline = async (connectionId: string): Promise<void> => {
    if (!accessToken) return;
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await declineConnection(connectionId, accessToken);
      updateConnection(updated);
      setRequestSuccess("Connection request declined.");
      await loadDiscover();
    } catch (requestErrorValue) {
      setRequestError(requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to decline");
    }
  };

  const onBlock = async (connectionId: string): Promise<void> => {
    if (!accessToken) return;
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const updated = await blockConnection(connectionId, accessToken);
      updateConnection(updated);
      setRequestSuccess("Person blocked.");
      await loadDiscover();
    } catch (requestErrorValue) {
      setRequestError(requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to block");
    }
  };

  const discoverCards = searchResults.length > 0 ? searchResults : discoverPeople;

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="People"
            title="Discover local people and build trusted connections"
            subtitle="See recommended members first, then manage accepted and pending relationships."
            actions={<Button type="button" variant="ghost" onClick={() => void Promise.all([loadConnections(), loadDiscover()])}>Refresh</Button>}
          />
          <RequireSession>
            <div className="stack">
              {listError ? <Banner tone="error">{listError}</Banner> : null}
              {requestError ? <Banner tone="error">{requestError}</Banner> : null}
              {requestSuccess ? <Banner tone="success">{requestSuccess}</Banner> : null}
              {searchError ? <Banner tone="error">{searchError}</Banner> : null}

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <Button type="button" variant={activeTab === "discover" ? "primary" : "secondary"} onClick={() => setActiveTab("discover")}>Discover</Button>
                <Button type="button" variant={activeTab === "connections" ? "primary" : "secondary"} onClick={() => setActiveTab("connections")}>Connections</Button>
              </div>

              {activeTab === "discover" ? (
                <div className="stack">
                  <Card className="stack">
                    <h3 style={{ fontFamily: "var(--font-display)" }}>Find a person</h3>
                    <p className="muted-text">Search by name, member ID, service, or location, or use the random discover cards below.</p>
                    <form onSubmit={onRequestConnection} className="grid two" style={{ alignItems: "flex-end" }}>
                      <Field label="Find a person" hint="Name, member ID, service type, location, or a mix of these.">
                        <TextInput value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder="plumber kakkanad" />
                      </Field>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <Button type="submit" disabled={requestLoading}>{requestLoading ? "Sending..." : "Send request"}</Button>
                        <Button type="button" variant="secondary" disabled={searchLoading} onClick={() => void onSearchConnections()}>{searchLoading ? "Searching..." : "Search"}</Button>
                      </div>
                    </form>
                  </Card>

                  {discoverLoading && discoverCards.length === 0 ? <Card soft><div className="muted-text">Loading discover people...</div></Card> : null}
                  {discoverCards.length === 0 && !discoverLoading ? (
                    <EmptyState title="No people to discover right now" body="As more members join nearby, they’ll show up here for connection requests." />
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                      {discoverCards.map((person) => (
                        <Card key={person.userId} className="stack" style={{ gap: "12px" }}>
                          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                            <MemberAvatar name={person.displayName} avatar={person.avatar} />
                            <div className="stack" style={{ gap: "4px", flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{person.displayName}</div>
                              <div className="muted-text">ID: {person.userId}</div>
                              <div className="muted-text">{person.locationLabel ?? "Location coming soon"}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {person.topSkills.length > 0 ? person.topSkills.map((skill) => <span key={skill} className="pill">{skill}</span>) : <span className="pill">Profile still adding services</span>}
                          </div>
                          <div className="muted-text" style={{ fontSize: "0.95rem" }}>
                            {person.recentJobCategories.length > 0
                              ? `Recent work: ${person.recentJobCategories.slice(0, 2).join(", ")}`
                              : "No recent jobs posted yet."}
                          </div>
                          <Button type="button" disabled={requestLoading} onClick={() => void submitConnectionRequest({ targetUserId: person.userId })}>
                            Request connection
                          </Button>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="stack">
                  <div className="kpi-grid">
                    <div className="kpi"><div className="kpi-label">Accepted</div><div className="kpi-value">{acceptedConnections.length}</div></div>
                    <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-value">{pendingConnections.length}</div></div>
                    <div className="kpi"><div className="kpi-label">Total</div><div className="kpi-value">{connections.length}</div></div>
                  </div>

                  <Card className="stack">
                    <h3 style={{ fontFamily: "var(--font-display)" }}>Accepted connections</h3>
                    {acceptedConnections.length === 0 ? (
                      <EmptyState title="No accepted connections yet" body="Use Discover to find people nearby and send your first request." />
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                        {acceptedConnections.map((connection) => {
                          const person = connection.otherUser;
                          const otherUserId = personIdFromConnection(connection, user?.publicUserId);
                          const displayName = person?.displayName ?? otherUserId;
                          return (
                            <Card key={connection.id} soft>
                              <div className="stack" style={{ gap: "12px" }}>
                                <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                                  <MemberAvatar name={displayName} avatar={person?.avatar ?? null} />
                                  <div className="stack" style={{ gap: "4px", flex: 1 }}>
                                    <div style={{ fontWeight: 700 }}>{displayName}</div>
                                    <div className="muted-text">ID: {otherUserId}</div>
                                    <div className="muted-text">{person?.locationLabel ?? "Location not set"}</div>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                  {(person?.topSkills ?? []).map((skill) => <span key={skill} className="pill">{skill}</span>)}
                                  {(person?.topSkills ?? []).length === 0 ? <span className="pill">No skills listed yet</span> : null}
                                </div>
                                <Button type="button" variant="ghost" onClick={() => void onBlock(connection.id)}>Block</Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  <Card className="stack">
                    <h3 style={{ fontFamily: "var(--font-display)" }}>Pending requests</h3>
                    {pendingConnections.length === 0 ? (
                      <EmptyState title="No pending requests" body="Incoming and outgoing requests will appear here." />
                    ) : (
                      <div style={{ display: "grid", gap: "16px" }}>
                        {pendingConnections.map((connection) => {
                          const currentUserId = user?.publicUserId;
                          const otherUserId = personIdFromConnection(connection, currentUserId);
                          const incoming = connection.requestedByUserId !== currentUserId;
                          return (
                            <Card key={connection.id} soft>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
                                <div className="stack" style={{ gap: "4px" }}>
                                  <div style={{ fontWeight: 700 }}>{otherUserId}</div>
                                  <div className="muted-text">{incoming ? "Incoming request" : "Waiting for response"}</div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                  {incoming ? <Button type="button" onClick={() => void onAccept(connection.id)}>Accept</Button> : null}
                                  <Button type="button" variant="secondary" onClick={() => void onDecline(connection.id)}>{incoming ? "Decline" : "Withdraw"}</Button>
                                  <Button type="button" variant="ghost" onClick={() => void onBlock(connection.id)}>Block</Button>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {listLoading ? <div className="muted-text">Refreshing people...</div> : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
