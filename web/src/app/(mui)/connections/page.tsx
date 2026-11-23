"use client";

import { formatUiError } from "@illamhelp/shared-types";

import type { CSSProperties } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
  const [lastSearch, setLastSearch] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ConnectionSearchCandidate[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [profileMediaByUserId, setProfileMediaByUserId] = useState<Record<string, PublicMediaAssetRecord[]>>({});

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [blockReview, setBlockReview] = useState<string | null>(null);

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
        formatUiError(requestErrorValue, "Couldn’t load connections. Refresh the list to try again.")
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
        formatUiError(requestErrorValue, "Couldn’t load more connections. Try again.")
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

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

  const submitConnectionRequest = async (targetUserId: string): Promise<void> => {
    if (!accessToken || requestLoading) return;
    setRequestLoading(true);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      const created = await requestConnection({ targetUserId }, accessToken);
      setConnections((previous) => {
        const withoutSameId = previous.filter((connection) => connection.id !== created.id);
        return [created, ...withoutSameId];
      });
      setRequestSuccess("Connection request sent.");
    } catch (requestErrorValue) {
      setRequestError(
        formatUiError(requestErrorValue, "Couldn’t send the request. Open the member’s profile and try again.")
      );
    } finally {
      setRequestLoading(false);
    }
  };

  const onSearchConnections = async (): Promise<void> => {
    if (!accessToken || searchLoading || requestLoading) return;
    const query = targetQuery.trim();
    setRequestError(null);
    setRequestSuccess(null);
    setSearchError(null);
    setLastSearch(null);
    setSearchResults([]);
    if (!query) {
      setSearchError("Enter a name, member ID, service, or location.");
      return;
    }
    setSearchLoading(true);
    try {
      const rows = await searchConnections({ q: query, limit: 8 }, accessToken);
      setSearchResults(rows);
      setLastSearch(query);
    } catch (requestErrorValue) {
      setSearchError(
        formatUiError(requestErrorValue, "Couldn’t search for people. Try another search.")
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const updateConnection = async (connectionId: string, action: "accept" | "decline" | "block"): Promise<void> => {
    if (!accessToken || actionId) return;
    const connection = connections.find((item) => item.id === connectionId);
    setActionId(connectionId);
    setActionError(null);
    setActionSuccess(null);
    const operations = { accept: acceptConnection, decline: declineConnection, block: blockConnection };
    try {
      const updated = await operations[action](connectionId, accessToken);
      setConnections((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setBlockReview(null);
      setActionSuccess(action === "accept" ? "Connection accepted." : action === "block" ? "Person blocked."
        : connection?.requestedByUserId === currentUserId ? "Connection request withdrawn." : "Connection request declined.");
    } catch (requestErrorValue) {
      setActionError(formatUiError(requestErrorValue, "Couldn’t update this connection. Refresh the list and try again."));
    } finally {
      setActionId(null);
    }
  };

  const incoming = pendingConnections.filter((item) => item.requestedByUserId !== currentUserId);
  const sent = pendingConnections.filter((item) => item.requestedByUserId === currentUserId);
  const searchMatches = lastSearch === targetQuery.trim() ? searchResults : [];
  const relationships = new Map(connections.map((item) => [
    item.userAId === currentUserId ? item.userBId : item.userAId,
    item
  ]));

  const renderConnectionCard = (connection: ConnectionRecord, index = 0): JSX.Element => {
    const otherUserId = connection.userAId === currentUserId ? connection.userBId : connection.userAId;
    const canAccept = connection.status === "pending" && connection.requestedByUserId !== currentUserId;
    const canDecline = connection.status === "pending";
    const reviewingBlock = blockReview === connection.id;
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
            {accepted ? "Connected" : canAccept ? "Request received" : "Request sent"}
          </StatusLabel>
        </div>
        <p className="muted-text">Requested {formatDate(connection.requestedAt).split(",")[0]}</p>
        {accepted ? (
          <MediaPreviewGrid items={profileMedia} emptyText="No approved profile media yet." testId={`connection-profile-media-${otherUserId}`} />
        ) : (
          <p className="muted-text">Approved profile media becomes available after you connect.</p>
        )}
        {reviewingBlock ? (
          <div className="stack people-block-review">
            <strong>Block {personLabel(profilesByUserId[otherUserId])}?</strong>
            <p className="muted-text">This ends the connection and any contact sharing between you.</p>
            <div className="people-card-actions">
              <Button type="button" disabled={!!actionId} onClick={() => void updateConnection(connection.id, "block")}>Block person</Button>
              <Button type="button" variant="ghost" disabled={!!actionId} onClick={() => setBlockReview(null)}>Keep connection</Button>
            </div>
          </div>
        ) : (
          <div className="people-card-actions">
            {canAccept ? <Button type="button" disabled={!!actionId} onClick={() => void updateConnection(connection.id, "accept")}>Accept request</Button> : null}
            {canDecline ? (
              <Button type="button" variant="secondary" disabled={!!actionId} onClick={() => void updateConnection(connection.id, "decline")}>
                {connection.requestedByUserId === currentUserId ? "Withdraw request" : "Decline request"}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => router.push(`/profile/${encodeURIComponent(otherUserId)}`)}>View profile</Button>
            <Button type="button" variant="ghost" disabled={!!actionId} onClick={() => setBlockReview(connection.id)}>
              Block {personLabel(profilesByUserId[otherUserId])}
            </Button>
          </div>
        )}
      </article>
    );
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader title="People" subtitle="Find members and manage your connections." />
          <RequireSession>
            <div className="stack">
              <Card variant="action" className="stack">
                <h2>Find a person</h2>
                {requestError ? <Banner tone="error">{requestError}</Banner> : null}
                {requestSuccess ? <Banner tone="success">{requestSuccess}</Banner> : null}
                {searchError ? <Banner tone="error">{searchError}</Banner> : null}
                <form className="people-search-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void onSearchConnections();
                }}>
                  <Field label="Find a person">
                    <TextInput aria-describedby="people-search-hint" value={targetQuery} onChange={(event) => {
                      setTargetQuery(event.target.value);
                      setSearchError(null);
                    }} placeholder="e.g. Anita or plumber" />
                  </Field>
                  <Button type="submit" disabled={searchLoading || requestLoading}>
                    {searchLoading ? "Searching…" : "Search people"}
                  </Button>
                </form>
                <p className="field-hint" id="people-search-hint">Search by name, service, location, or member ID.</p>
                {lastSearch !== null && lastSearch === targetQuery.trim() && searchMatches.length === 0 ? (
                  <p className="muted-text" role="status">No people found. Try a different search.</p>
                ) : null}
                {searchMatches.length > 0 ? (
                  <section className="stack" aria-label="Search results">
                    <h3>Search results</h3>
                    <div className="people-record-list">
                      {searchMatches.map((candidate) => {
                        const relationship = relationships.get(candidate.userId);
                        const status = relationship?.status;
                        return (
                          <article className="people-card" key={candidate.userId}>
                            <PersonSummary userId={candidate.userId} label={candidate.displayName} meta={[
                              candidate.locationLabel, candidate.serviceCategories.join(", ")
                            ].filter(Boolean).join(" · ")} />
                            <div className="people-card-actions">
                              <Button type="button" variant="secondary" onClick={() => router.push(`/profile/${encodeURIComponent(candidate.userId)}`)}>View profile</Button>
                              {status === "accepted" || status === "pending" || status === "blocked" ? (
                                <StatusLabel tone={status === "accepted" ? "success" : "neutral"}>
                                  {status === "accepted" ? "Connected" : status === "blocked" ? "Blocked" :
                                    relationship?.requestedByUserId === currentUserId ? "Request sent" : "Request received"}
                                </StatusLabel>
                              ) : (
                                <Button type="button" disabled={requestLoading || listLoading} onClick={() => void submitConnectionRequest(candidate.userId)}>Send request</Button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </Card>

              <section className="media-section-stack" aria-labelledby="current-people-heading">
                <div className="media-section-title">
                  <h2 id="current-people-heading">Your connections</h2>
                  <Button type="button" variant="ghost" disabled={listLoading || !!actionId || requestLoading} onClick={() => void loadConnections()}>Refresh connections</Button>
                </div>
                {listError ? <Banner tone="error">{listError}</Banner> : null}
                {actionError ? <Banner tone="error">{actionError}</Banner> : null}
                {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}
                {listLoading && connections.length === 0 ? <Skeleton lines={3} /> : null}
                {!listLoading && !listError && !incoming.length && !sent.length && !acceptedConnections.length ? (
                  <EmptyState title="No active connections" body="Find a member and send them a connection request." />
                ) : null}
                {[
                  { title: "Requests to you", items: incoming },
                  { title: "Requests you sent", items: sent },
                  { title: "Connected people", items: acceptedConnections }
                ].map(({ title, items }) => items.length > 0 ? (
                  <section className="people-group" key={title}>
                    <h3>{title}</h3>
                    <div className="people-record-list">{items.map(renderConnectionCard)}</div>
                  </section>
                ) : null)}
                {nextCursor ? (
                  <div><Button type="button" variant="secondary" disabled={listLoading || !!actionId || requestLoading} onClick={() => void loadMoreConnections()}>
                    {listLoading ? "Loading connections…" : "Load more connections"}
                  </Button></div>
                ) : null}
              </section>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
