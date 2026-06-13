"use client";

import type { CSSProperties } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
import { PageShell } from "@/components/PageShell";
import { PersonSummary, personLabel } from "@/components/PersonSummary";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
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

  const renderConnectionCard = (connection: ConnectionRecord, index = 0): JSX.Element => {
    const otherUserId = connection.userAId === currentUserId ? connection.userBId : connection.userAId;
    const canAccept = connection.status === "pending" && connection.requestedByUserId !== currentUserId;
    const canDecline = connection.status === "pending";
    const canBlock = connection.status !== "blocked";
    const profileMedia = profileMediaByUserId[otherUserId] ?? [];
    const accepted = connection.status === "accepted";

    return (
      <article
        key={connection.id}
        className="people-card motion-row-change"
        style={{ "--i": index } as CSSProperties & Record<"--i", number>}
      >
        <div className="people-card-header">
          <PersonSummary userId={otherUserId} profile={profilesByUserId[otherUserId]} compact />
          <StatusLabel tone={accepted ? "success" : connection.status === "pending" ? "warning" : "neutral"}>
            {connection.status.replaceAll("_", " ")}
          </StatusLabel>
        </div>
        <div className="people-privacy-row">
          <span>{accepted ? `${profileMedia.length} approved profile media` : "Profile media after acceptance"}</span>
          <span>Requested {formatDate(connection.requestedAt).split(",")[0]}</span>
        </div>
        {accepted ? (
          <MediaPreviewGrid
            items={profileMedia}
            emptyText="No approved profile media yet."
            testId={`connection-profile-media-${otherUserId}`}
          />
        ) : (
          <div className="media-empty">
            <strong>Privacy gate active</strong>
            <p className="muted-text">Approved profile media appears only after both people accept the connection.</p>
          </div>
        )}
        <div className="people-card-actions">
          {canAccept ? <Button type="button" onClick={() => void onAccept(connection.id)}>Accept request</Button> : null}
          {canDecline ? (
            <Button type="button" variant="secondary" onClick={() => void onDecline(connection.id)}>
              {connection.requestedByUserId === currentUserId ? "Withdraw request" : "Decline request"}
            </Button>
          ) : null}
          {canBlock ? (
            <Button type="button" variant="ghost" onClick={() => void onBlock(connection.id)}>
              Block {personLabel(profilesByUserId[otherUserId])}
            </Button>
          ) : null}
        </div>
      </article>
    );
  };

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
              <div className="media-page-hero">
                <div>
                  <p className="surface-label">Human identity</p>
                  <h2>People you can recognize before you share.</h2>
                  <p className="muted-text">
                    Search by name, service, location, or member ID. Accepted people show approved profile media here.
                  </p>
                </div>
                <div className="media-hero-stats" aria-label="People summary">
                  <div>
                    <strong>{connections.length}</strong>
                    <span>Total</span>
                  </div>
                  <div>
                    <strong>{statusSummary.pending ?? 0}</strong>
                    <span>Pending</span>
                  </div>
                  <div>
                    <strong>{statusSummary.accepted ?? 0}</strong>
                    <span>Accepted</span>
                  </div>
                </div>
              </div>

              <Card className="media-composer-card stack">
                <div className="media-section-title">
                  <div>
                    <p className="surface-label">Next safe action</p>
                    <h3>Find a person</h3>
                  </div>
                  <StatusLabel tone="info">Request required</StatusLabel>
                </div>
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
                      {searchLoading ? "Searching" : "Search people"}
                    </Button>
                    <Button type="submit" disabled={requestLoading}>
                      {requestLoading ? "Sending request" : "Send request"}
                    </Button>
                  </div>
                </form>
                {searchResults.length > 0 ? (
                  <div className="stack" style={{ marginTop: "var(--spacing-lg)" }}>
                    <div className="media-section-title">
                      <div>
                        <p className="surface-label">Search matches</p>
                        <h4>Choose who to invite</h4>
                      </div>
                    </div>
                    <div className="people-grid">
                      {searchResults.map((candidate, index) => (
                        <article
                          key={candidate.userId}
                          className="people-card"
                          style={{ "--i": index } as CSSProperties & Record<"--i", number>}
                        >
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
                          <div className="people-card-actions">
                            <Button type="button" disabled={requestLoading} onClick={() => void submitConnectionRequest({ targetUserId: candidate.userId })}>
                              Send request
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>

              <section className="media-section-stack" aria-labelledby="current-people-heading">
                <div className="media-section-title">
                  <div>
                    <p className="surface-label">Privacy state</p>
                    <h3 id="current-people-heading">Current people</h3>
                  </div>
                  <StatusLabel tone="success">{acceptedConnections.length} accepted</StatusLabel>
                </div>
                {listError ? <Banner tone="error">{listError}</Banner> : null}
                {actionError ? <Banner tone="error">{actionError}</Banner> : null}

                {listLoading ? <Skeleton lines={3} /> : null}
                {!listLoading && connections.length === 0 ? (
                  <EmptyState
                    title="No connections yet"
                    body="Send a request first, then wait for the other person to accept."
                  />
                ) : null}
                {!listLoading && pendingConnections.length > 0 ? (
                  <div className="people-group">
                    <div className="people-group-title">
                      <h4>Pending requests</h4>
                      <StatusLabel tone="warning">{pendingConnections.length} pending</StatusLabel>
                    </div>
                    <div className="people-grid">{pendingConnections.map(renderConnectionCard)}</div>
                  </div>
                ) : null}
                {!listLoading && acceptedConnections.length > 0 ? (
                  <div className="people-group">
                    <div className="people-group-title">
                      <h4>Connected people</h4>
                      <StatusLabel tone="success">{acceptedConnections.length} connected</StatusLabel>
                    </div>
                    <div className="people-grid">{acceptedConnections.map(renderConnectionCard)}</div>
                  </div>
                ) : null}
                {nextCursor ? (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--spacing-md)" }}>
                    <Button type="button" variant="secondary" disabled={listLoading} onClick={() => void loadMoreConnections()}>
                      {listLoading ? "Loading connections" : "Load more connections"}
                    </Button>
                  </div>
                ) : null}
              </section>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
