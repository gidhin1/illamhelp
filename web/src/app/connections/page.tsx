"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
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
  Skeleton,
  StatusLabel,
  TextInput
} from "@/components/ui/primitives";
import {
  acceptConnection,
  blockConnection,
  ConnectionSearchCandidate,
  ConnectionRecord,
  declineConnection,
  formatDate,
  getProfileByUserId,
  listConnections,
  listPublicApprovedMediaPage,
  ProfileRecord,
  requestConnection,
  searchConnections,
  PublicMediaAssetRecord
} from "@/lib/api";

export default function ConnectionsPage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [targetQuery, setTargetQuery] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ConnectionSearchCandidate[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [profileMediaByUserId, setProfileMediaByUserId] = useState<Record<string, PublicMediaAssetRecord[]>>({});

  const [actionError, setActionError] = useState<string | null>(null);

  const loadConnections = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);
    try {
      const result = await listConnections(accessToken);
      setConnections(result.items);
      setNextCursor(result.nextCursor);
    } catch (requestErrorValue) {
      setListError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to load connections"
      );
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  const loadMoreConnections = async (): Promise<void> => {
    if (!accessToken || !nextCursor) return;
    setListLoading(true);
    setListError(null);
    try {
      const result = await listConnections(accessToken, { cursor: nextCursor });
      setConnections((previous) => [...previous, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (requestErrorValue) {
      setListError(
        requestErrorValue instanceof Error ? requestErrorValue.message : "Unable to load more connections"
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const statusSummary = useMemo(() => {
    return connections.reduce<Record<string, number>>((acc, connection) => {
      acc[connection.status] = (acc[connection.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [connections]);

  const currentUserId = user?.publicUserId;
  const pendingConnections = useMemo(
    () => connections.filter((connection) => connection.status === "pending"),
    [connections]
  );
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );

  useEffect(() => {
    if (!accessToken || !currentUserId || acceptedConnections.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        acceptedConnections.map(async (connection) => {
          const otherUserId =
            connection.userAId === currentUserId ? connection.userBId : connection.userAId;
          try {
            const page = await listPublicApprovedMediaPage(otherUserId, accessToken);
            return [otherUserId, page.items.filter((asset) => asset.purpose === "profile")] as const;
          } catch {
            return [otherUserId, []] as const;
          }
        })
      );
      if (!cancelled) {
        setProfileMediaByUserId(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [acceptedConnections, accessToken, currentUserId]);

  useEffect(() => {
    if (!accessToken || connections.length === 0) return;
    const otherUserIds = Array.from(
      new Set(
        connections
          .map((connection) =>
            connection.userAId === currentUserId ? connection.userBId : connection.userAId
          )
          .filter((userId): userId is string => Boolean(userId))
      )
    );
    const missing = otherUserIds.filter((userId) => !profilesByUserId[userId]);
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (userId) => {
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
  }, [accessToken, connections, currentUserId, profilesByUserId]);

  const submitConnectionRequest = async (payload: { targetUserId?: string; targetQuery?: string; }): Promise<void> => {
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
      setSearchResults([]);
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

  const onAccept = async (connectionId: string): Promise<void> => {
    if (!accessToken) return;
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
    if (!accessToken) return;
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
    if (!accessToken) return;
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

  const columns: ColumnDef<ConnectionRecord>[] = [
    {
      id: "otherUser",
      header: "Person",
      cell: ({ row }) => {
        const connection = row.original;
        const otherUserId = connection.userAId === user?.publicUserId ? connection.userBId : connection.userAId;
        return (
          <PersonSummary
            userId={otherUserId}
            profile={profilesByUserId[otherUserId]}
            compact
          />
        );
      }
    },
    {
      id: "profileMedia",
      header: "Profile media",
      cell: ({ row }) => {
        const connection = row.original;
        const otherUserId = connection.userAId === user?.publicUserId ? connection.userBId : connection.userAId;
        const mediaCount = profileMediaByUserId[otherUserId]?.length ?? 0;
        return connection.status === "accepted" ? (
          <span className="muted-text">{mediaCount} approved</span>
        ) : (
          <span className="muted-text">Only after acceptance</span>
        );
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusLabel tone="info">{row.original.status.replaceAll("_", " ")}</StatusLabel>
    },
    {
      accessorKey: "requestedByUserId",
      header: "Request started by",
      cell: ({ row }) => (
        <PersonSummary
          userId={row.original.requestedByUserId}
          profile={profilesByUserId[row.original.requestedByUserId]}
          compact
        />
      )
    },
    {
      accessorKey: "requestedAt",
      header: "Requested On",
      cell: ({ row }) => formatDate(row.original.requestedAt).split(",")[0]
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const connection = row.original;
        const currentUserId = user?.publicUserId;
        const canAccept = connection.status === "pending" && connection.requestedByUserId !== currentUserId;
        const canDecline = connection.status === "pending";
        const canBlock = connection.status !== "blocked";

        return (
          <div style={{ display: "flex", gap: "8px" }}>
            {canAccept && <Button type="button" onClick={() => void onAccept(connection.id)}>Accept</Button>}
            {canDecline && (
              <Button type="button" variant="secondary" onClick={() => void onDecline(connection.id)}>
                {connection.requestedByUserId === currentUserId ? "Withdraw" : "Decline"}
              </Button>
            )}
            {canBlock && (
              <Button type="button" variant="ghost" onClick={() => void onBlock(connection.id)}>Block</Button>
            )}
            {!canAccept && !canDecline && !canBlock && <span className="muted-text">-</span>}
          </div>
        );
      }
    }
  ];

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="People"
            title="Connect with people you trust"
            subtitle="Find people by name, service, location, or member ID."
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
                <form onSubmit={onRequestConnection} className="grid two" style={{ alignItems: "flex-end" }}>
                  <Field
                    label="Find a person"
                    hint="Use a name, service type, location, or member ID."
                  >
                    <TextInput
                      value={targetQuery}
                      onChange={(event) => setTargetQuery(event.target.value)}
                      placeholder="e.g. Anita, plumber kochi, or member ID"
                      required
                    />
                  </Field>
                  <div style={{ display: "flex", gap: "var(--spacing-sm)", flexWrap: "wrap", alignItems: "center" }}>
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
                  <div className="stack" style={{ marginTop: "var(--spacing-lg)" }}>
                    <h4 style={{ fontFamily: "var(--font-display)" }}>Matches</h4>
                    <div className="grid two">
                      {searchResults.map((candidate) => (
                        <Card key={candidate.userId} className="stack">
                          <PersonSummary
                            userId={candidate.userId}
                            label={candidate.displayName}
                            meta={[
                              candidate.locationLabel,
                              candidate.serviceCategories.slice(0, 2).join(", ") || null
                            ].filter(Boolean).join(" · ")}
                          />
                          {candidate.locationLabel ? <div className="muted-text">Location: {candidate.locationLabel}</div> : null}
                          {candidate.serviceCategories.length > 0 ? (
                            <div className="muted-text">Services: {candidate.serviceCategories.join(", ")}</div>
                          ) : null}
                          <div style={{ marginTop: "10px" }}>
                            <Button type="button" disabled={requestLoading} onClick={() => void submitConnectionRequest({ targetUserId: candidate.userId })}>
                              Connect
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>

              <div className="stack">
                <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Current connections</h3>
                {listError ? <Banner tone="error">{listError}</Banner> : null}
                {actionError ? <Banner tone="error">{actionError}</Banner> : null}

                <div className="mobile-only stack">
                  {listLoading ? (
                    <Skeleton lines={3} />
                  ) : null}

                  {!listLoading && connections.length === 0 ? (
                    <EmptyState
                      title="No connections yet"
                      body="Send a request first, then wait for the other person to accept."
                    />
                  ) : null}

                  {!listLoading && pendingConnections.length > 0 ? (
                    <Card className="stack">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-sm)" }}>
                        <h4 style={{ fontFamily: "var(--font-display)" }}>Pending</h4>
                        <StatusLabel tone="warning">{pendingConnections.length} pending</StatusLabel>
                      </div>
                      <div className="stack" style={{ gap: "var(--spacing-md)" }}>
                        {pendingConnections.map((connection) => {
                          const otherUserId =
                            connection.userAId === currentUserId ? connection.userBId : connection.userAId;
                          const canAccept =
                            connection.requestedByUserId !== currentUserId;
                          return (
                            <div key={connection.id} className="card soft stack" style={{ gap: "var(--spacing-sm)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-sm)" }}>
                                <PersonSummary
                                  userId={otherUserId}
                                  profile={profilesByUserId[otherUserId]}
                                  compact
                                />
                                <StatusLabel tone="warning">pending</StatusLabel>
                              </div>
                              <div className="muted-text">Requested {formatDate(connection.requestedAt)}</div>
                              <div style={{ display: "flex", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
                                {canAccept ? (
                                  <Button type="button" onClick={() => void onAccept(connection.id)}>
                                    Accept
                                  </Button>
                                ) : null}
                                <Button type="button" variant="secondary" onClick={() => void onDecline(connection.id)}>
                                  {canAccept ? "Decline" : "Withdraw"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  ) : null}

                  {!listLoading && acceptedConnections.length > 0 ? (
                    <Card className="stack">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-sm)" }}>
                        <h4 style={{ fontFamily: "var(--font-display)" }}>Connected people</h4>
                        <StatusLabel tone="success">{acceptedConnections.length} connected</StatusLabel>
                      </div>
                      <div className="stack" style={{ gap: "var(--spacing-md)" }}>
                        {acceptedConnections.map((connection) => {
                          const otherUserId =
                            connection.userAId === currentUserId ? connection.userBId : connection.userAId;
                          return (
                            <div key={connection.id} className="card soft stack" style={{ gap: "var(--spacing-sm)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-sm)" }}>
                                <PersonSummary
                                  userId={otherUserId}
                                  profile={profilesByUserId[otherUserId]}
                                  compact
                                />
                                <StatusLabel tone="success">accepted</StatusLabel>
                              </div>
                              <div className="muted-text">Connected {formatDate(connection.requestedAt)}</div>
                              <MediaPreviewGrid
                                items={profileMediaByUserId[otherUserId] ?? []}
                                emptyText="No approved profile media yet."
                                testId={`connection-profile-media-${otherUserId}`}
                              />
                              <div style={{ display: "flex", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
                                <Button type="button" variant="ghost" onClick={() => void onBlock(connection.id)}>
                                  Block {personLabel(profilesByUserId[otherUserId])}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  ) : null}
                </div>

                <div className="desktop-only">
                  {listLoading ? (
                    <Skeleton lines={3} />
                  ) : connections.length > 0 ? (
                    <DataTable ariaLabel="Current connections" columns={columns} data={connections} />
                  ) : (
                    <EmptyState
                      title="No connections yet"
                      body="Send a request first, then wait for the other person to accept."
                    />
                  )}
                </div>
                {nextCursor ? (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--spacing-md)" }}>
                    <Button type="button" variant="secondary" disabled={listLoading} onClick={() => void loadMoreConnections()}>
                      {listLoading ? "Loading connections" : "Load more connections"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
