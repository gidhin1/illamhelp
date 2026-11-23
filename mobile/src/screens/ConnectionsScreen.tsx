import type { JSX } from "react";

import {
  acceptConnection, AuthenticatedUser, blockConnection,
  ConnectionSearchCandidate, ConnectionRecord,
  declineConnection, formatDate, getProfileByUserId, listConnectionsPage,
  listPublicApprovedMediaPage, PublicMediaAssetRecord,
  ProfileRecord, requestConnection, searchConnections
} from "../api";

import {
  shouldForceSignOut, asError
} from "../utils";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { AppButton, Banner, CardSurface, InputField, SectionCard, StatusLabel } from "../components";
import { MediaPreviewList } from "../MediaPreviewList";
import { useAppStyles } from "../theme-context";

export function ConnectionsScreen({
  accessToken,
  user,
  active,
  onSessionInvalid,
  onDiscoverProfile
}: {
  accessToken: string;
  user: AuthenticatedUser;
  active: boolean;
  onSessionInvalid: () => void;
  onDiscoverProfile: (userId: string) => void;
}): JSX.Element {
  const styles = useAppStyles();
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [matches, setMatches] = useState<ConnectionSearchCandidate[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [profileMediaByUserId, setProfileMediaByUserId] = useState<Record<string, PublicMediaAssetRecord[]>>({});
  const [searching, setSearching] = useState(false);
  const [lastSearch, setLastSearch] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [blockReview, setBlockReview] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const visibleConnections = connections;
  const visibleMatches = lastSearch === targetQuery.trim() ? matches : [];
  const pendingConnections = useMemo(
    () => visibleConnections.filter((connection) => connection.status === "pending"),
    [visibleConnections]
  );
  const acceptedConnections = useMemo(
    () => visibleConnections.filter((connection) => connection.status === "accepted"),
    [visibleConnections]
  );
  const personName = useCallback(
    (userId: string): string => profilesByUserId[userId]?.displayName || `Member ${userId}`,
    [profilesByUserId]
  );
  const personMeta = useCallback(
    (userId: string): string => {
      const profile = profilesByUserId[userId];
      if (!profile) return `Member ID: ${userId}`;
      return [
        [profile.city, profile.area].filter(Boolean).join(", "),
        profile.serviceCategories.slice(0, 2).join(", "),
        `Member ID: ${profile.userId}`
      ].filter(Boolean).join(" · ");
    },
    [profilesByUserId]
  );

  useEffect(() => {
    if (acceptedConnections.length === 0) {
      setProfileMediaByUserId({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        acceptedConnections.map(async (connection) => {
          const otherUser =
            connection.userAId === user.publicUserId ? connection.userBId : connection.userAId;
          try {
            const page = await listPublicApprovedMediaPage(otherUser, accessToken);
            return [otherUser, page.items.filter((asset) => asset.purpose === "profile")] as const;
          } catch {
            return [otherUser, []] as const;
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
  }, [acceptedConnections, accessToken, user.publicUserId]);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        visibleConnections.map((connection) =>
          connection.userAId === user.publicUserId ? connection.userBId : connection.userAId
        )
      )
    ).filter((userId) => !profilesByUserId[userId]);
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
  }, [accessToken, profilesByUserId, user.publicUserId, visibleConnections]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await listConnectionsPage(accessToken);
      setConnections(page.items);
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t load connections. Refresh the list to try again.");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listConnectionsPage(accessToken, nextCursor);
      setConnections((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t load more connections. Try again.");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, nextCursor, onSessionInvalid]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const submitRequest = async (targetUserId: string): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setRequestMessage(null);
    setSearchError(null);
    try {
      const connection = await requestConnection({ targetUserId }, accessToken);
      setConnections((previous) => [connection, ...previous.filter((item) => item.id !== connection.id)]);
      setRequestMessage("Connection request sent.");
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t send the request. Refresh connections and try again.");
      setSearchError(message);
      if (shouldForceSignOut(message)) onSessionInvalid();
    } finally {
      setSubmitting(false);
    }
  };

  const onSearch = async (): Promise<void> => {
    if (searching || submitting) return;
    const query = targetQuery.trim();
    setLastSearch(null);
    setMatches([]);
    setRequestMessage(null);
    setSearchError(null);
    if (!query) {
      setSearchError("Enter a name, member ID, service, or location.");
      return;
    }
    setSearching(true);
    try {
      setMatches(await searchConnections({ q: query, limit: 8 }, accessToken));
      setLastSearch(query);
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t search for people. Try another search.");
      setSearchError(message);
      if (shouldForceSignOut(message)) onSessionInvalid();
    } finally {
      setSearching(false);
    }
  };

  const updateConnection = async (connection: ConnectionRecord, action: "accept" | "decline" | "block"): Promise<void> => {
    if (updating) return;
    setUpdating(connection.id);
    setSubmitMessage(null);
    setError(null);
    const operations = { accept: acceptConnection, decline: declineConnection, block: blockConnection };
    try {
      const updated = await operations[action](connection.id, accessToken);
      setConnections((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setBlockReview(null);
      setSubmitMessage(action === "accept" ? "Connection accepted." : action === "block" ? "Person blocked."
        : connection.requestedByUserId === user.publicUserId ? "Connection request withdrawn." : "Connection request declined.");
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t update this connection. Refresh the list and try again.");
      setError(message);
      if (shouldForceSignOut(message)) onSessionInvalid();
    } finally {
      setUpdating(null);
    }
  };

  const currentUserId = user.publicUserId;
  const incoming = pendingConnections.filter((item) => item.requestedByUserId !== currentUserId);
  const sent = pendingConnections.filter((item) => item.requestedByUserId === currentUserId);
  const relationships = new Map(connections.map((item) => [
    item.userAId === currentUserId ? item.userBId : item.userAId, item
  ]));

  const renderConnection = (connection: ConnectionRecord): JSX.Element => {
    const otherUserId = connection.userAId === currentUserId ? connection.userBId : connection.userAId;
    const accepted = connection.status === "accepted";
    const received = !accepted && connection.requestedByUserId !== currentUserId;
    const name = personName(otherUserId);
    return (
      <CardSurface key={connection.id} variant={received ? "review" : "record"}>
        <Text style={styles.dataTitle}>{name}</Text>
        <Text style={styles.dataMeta}>{personMeta(otherUserId)}</Text>
        <StatusLabel label={accepted ? "Connected" : received ? "Request received" : "Request sent"} tone={accepted ? "success" : "warning"} />
        <Text style={styles.dataMeta}>Requested {formatDate(connection.requestedAt)}</Text>
        {accepted ? (
          <MediaPreviewList items={profileMediaByUserId[otherUserId] ?? []} emptyText="No approved profile media yet." testID={`connections-profile-media-${otherUserId}`} deferVideo />
        ) : (
          <Text style={styles.cardBodyMuted}>Approved profile media becomes available after you connect.</Text>
        )}
        {blockReview === connection.id ? (
          <>
            <Text style={styles.dataTitle}>Block {name}?</Text>
            <Text style={styles.cardBodyMuted}>This ends the connection and any contact sharing between you.</Text>
            <AppButton label="Block person" disabled={!!updating} onPress={() => void updateConnection(connection, "block")} testID={`connections-confirm-block-${connection.id}`} />
            <AppButton label="Keep connection" variant="ghost" disabled={!!updating} onPress={() => setBlockReview(null)} testID="connections-keep" />
          </>
        ) : (
          <>
            {received ? <AppButton label="Accept request" disabled={!!updating} onPress={() => void updateConnection(connection, "accept")} testID={`connections-accept-${connection.id}`} /> : null}
            {!accepted ? (
              <AppButton label={received ? "Decline request" : "Withdraw request"} variant="secondary" disabled={!!updating} onPress={() => void updateConnection(connection, "decline")} testID={`connections-decline-${connection.id}`} />
            ) : null}
            <AppButton label="View profile" variant="secondary" onPress={() => onDiscoverProfile(otherUserId)} testID={`connections-profile-${otherUserId}`} />
            <AppButton label={`Block ${name}`} variant="ghost" disabled={!!updating} onPress={() => setBlockReview(connection.id)} testID={`connections-block-${connection.id}`} />
          </>
        )}
      </CardSurface>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="connections-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">People</Text>
        <Text style={styles.screenSubtitle}>Find members and manage your connections.</Text>
      </View>
      <SectionCard title="Find a person">
        <Text style={styles.cardBodyMuted}>Search by name, service, location, or member ID.</Text>
        <InputField
          label="Find a person"
          value={targetQuery}
          onChangeText={(value) => { setTargetQuery(value); setSearchError(null); }}
          placeholder="e.g. Anita or plumber"
          onSubmitEditing={() => void onSearch()}
          returnKeyType="search"
          testID="connections-target-user-id"
        />
        {searchError ? <Banner tone="error" message={searchError} testID="connections-search-error" /> : null}
        {requestMessage ? <Banner tone="success" message={requestMessage} testID="connections-request-success" /> : null}
        <AppButton label={searching ? "Searching…" : "Search people"} onPress={() => void onSearch()} disabled={searching || submitting} testID="connections-search-submit" />
        {lastSearch !== null && lastSearch === targetQuery.trim() && visibleMatches.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.cardBodyMuted}>No people found. Try a different search.</Text>
        ) : null}
        {visibleMatches.length > 0 ? (
          <View style={styles.stackSmall}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Search results</Text>
            {visibleMatches.map((candidate) => {
              const relationship = relationships.get(candidate.userId);
              const status = relationship?.status;
              return (
                <CardSurface key={candidate.userId} variant="record">
                  <Text style={styles.dataTitle}>{candidate.displayName}</Text>
                  <Text style={styles.dataMeta}>Member ID: {candidate.userId}</Text>
                  {candidate.locationLabel ? <Text style={styles.dataMeta}>{candidate.locationLabel}</Text> : null}
                  {candidate.serviceCategories.length ? <Text style={styles.dataMeta}>{candidate.serviceCategories.join(", ")}</Text> : null}
                  <AppButton label="View profile" onPress={() => onDiscoverProfile(candidate.userId)} variant="secondary" testID={`connections-match-discover-${candidate.userId}`} />
                  {status === "accepted" || status === "pending" || status === "blocked" ? (
                    <StatusLabel tone={status === "accepted" ? "success" : "neutral"} label={status === "accepted" ? "Connected" : status === "blocked" ? "Blocked" :
                      relationship?.requestedByUserId === currentUserId ? "Request sent" : "Request received"} />
                  ) : (
                    <AppButton label="Send request" onPress={() => void submitRequest(candidate.userId)} disabled={submitting || loading} testID={`connections-match-request-${candidate.userId}`} />
                  )}
                </CardSurface>
              );
            })}
          </View>
        ) : null}
      </SectionCard>
      <View style={styles.stackSmall}>
        <Text style={styles.cardTitle} accessibilityRole="header">Your connections</Text>
        <AppButton label={loading ? "Refreshing…" : "Refresh connections"} onPress={() => void load()} variant="ghost" disabled={loading || !!updating || submitting} testID="connections-refresh" />
        {error ? <Banner tone="error" message={error} testID="connections-error-banner" /> : null}
        {submitMessage ? <Banner tone="success" message={submitMessage} testID="connections-success-banner" /> : null}
        {!loading && !error && !incoming.length && !sent.length && !acceptedConnections.length ? (
          <Text style={styles.cardBodyMuted}>No active connections. Find a member and send them a request.</Text>
        ) : null}
        {[
          { title: "Requests to you", items: incoming },
          { title: "Requests you sent", items: sent },
          { title: "Connected people", items: acceptedConnections }
        ].map(({ title, items }) => items.length ? (
          <View key={title} style={styles.stackSmall}>
            <Text style={styles.fieldLabel} accessibilityRole="header">{title}</Text>
            {items.map(renderConnection)}
          </View>
        ) : null)}
        {nextCursor ? (
          <AppButton label={loading ? "Loading connections…" : "Load more connections"} onPress={() => void loadMore()} variant="secondary" disabled={loading || !!updating || submitting} testID="connections-load-more" />
        ) : null}
      </View>
    </ScrollView>
  );
}
