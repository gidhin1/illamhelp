
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
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { MediaPreviewList } from "../MediaPreviewList";
import { useAppTheme } from "../theme-context";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    header: {
      gap: 12,
      marginBottom: 6
    },
    headerTitle: {
      color: colors.ink,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "700"
    },
    headerBody: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 23
    },
    statRow: {
      flexDirection: "row",
      gap: 10
    },
    statCard: {
      flex: 1,
      borderRadius: 12,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    statLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16
    },
    statValue: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "700",
      lineHeight: 31
    },
    personCard: {
      borderRadius: 12,
      padding: 14,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8
    },
    personTitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10
    },
    personName: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 22
    },
    personId: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    personMeta: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19
    },
    sectionLabel: {
      color: colors.ink,
      fontSize: 19,
      fontWeight: "700",
      lineHeight: 24
    }
  });
}

export function ConnectionsScreen({
  accessToken,
  user,
  onSessionInvalid
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [matches, setMatches] = useState<ConnectionSearchCandidate[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [profileMediaByUserId, setProfileMediaByUserId] = useState<Record<string, PublicMediaAssetRecord[]>>({});
  const [searching, setSearching] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const visibleConnections = connections;
  const visibleMatches = useMemo(() => matches.slice(0, 8), [matches]);
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
      const message = asError(requestError, "Unable to load connections");
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
      const message = asError(requestError, "Unable to load more connections");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, nextCursor, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRequest = async (payload: {
    targetUserId?: string;
    targetQuery?: string;
  }): Promise<void> => {
    setSubmitting(true);
    setSubmitMessage(null);
    setError(null);
    try {
      const connection = await requestConnection(payload, accessToken);
      setConnections((previous) => [connection, ...previous]);
      setTargetQuery("");
      setMatches([]);
      setSubmitMessage("Connection request sent.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to request connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onRequest = async (): Promise<void> => {
    const normalizedQuery = targetQuery.trim();
    if (!normalizedQuery) {
      setError("Enter a name, member ID, service, or location.");
      return;
    }
    await submitRequest({ targetQuery: normalizedQuery });
  };

  const onSearch = async (): Promise<void> => {
    setSearching(true);
    setError(null);
    try {
      const rows = await searchConnections({ q: targetQuery.trim(), limit: 8 }, accessToken);
      setMatches(rows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to search people");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSearching(false);
    }
  };

  const onAccept = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await acceptConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Connection accepted.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to accept connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  const onDecline = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await declineConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Connection request declined.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to decline connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  const onBlock = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await blockConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Person blocked.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to block person");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="connections-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={localStyles.headerTitle}>Trusted people</Text>
        <Text style={localStyles.headerBody}>
          Search by name, service, location, or member ID.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="connections-error-banner" /> : null}
      {submitMessage ? <Banner tone="success" message={submitMessage} testID="connections-success-banner" /> : null}

      <View style={localStyles.statRow}>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Connected</Text>
          <Text style={localStyles.statValue}>{acceptedConnections.length}</Text>
        </View>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Pending</Text>
          <Text style={localStyles.statValue}>{pendingConnections.length}</Text>
        </View>
      </View>

      <SectionCard title="Find and connect">
        <InputField
          label="Find a person"
          value={targetQuery}
          onChangeText={setTargetQuery}
          placeholder="e.g. Anita, plumber kochi, or member ID"
          testID="connections-target-user-id"
        />
        <AppButton
          label={searching ? "Searching..." : "Search"}
          onPress={() => {
            void onSearch();
          }}
          variant="ghost"
          disabled={searching || submitting}
          testID="connections-search-submit"
        />
        <AppButton
          label={submitting ? "Sending..." : "Send request"}
          onPress={() => {
            void onRequest();
          }}
          disabled={submitting}
          testID="connections-request-submit"
        />
        {visibleMatches.length > 0 ? (
          <View style={styles.stackSmall}>
            <Text style={localStyles.sectionLabel}>Matches</Text>
            {visibleMatches.map((candidate) => (
              <View key={candidate.userId} style={localStyles.personCard}>
                <View style={localStyles.personTitleRow}>
                  <Text style={localStyles.personName}>{candidate.displayName}</Text>
                  <Text style={styles.pill}>Discover</Text>
                </View>
                <Text style={localStyles.personId}>Member ID: {candidate.userId}</Text>
                {candidate.locationLabel ? (
                  <Text style={localStyles.personMeta}>Location: {candidate.locationLabel}</Text>
                ) : null}
                {candidate.serviceCategories.length > 0 ? (
                  <Text style={localStyles.personMeta}>
                    Services: {candidate.serviceCategories.join(", ")}
                  </Text>
                ) : null}
                <AppButton
                  label="Connect"
                  onPress={() => {
                    void submitRequest({ targetUserId: candidate.userId });
                  }}
                  variant="secondary"
                  disabled={submitting}
                  testID={`connections-match-request-${candidate.userId}`}
                />
              </View>
            ))}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Connections list">
        {loading ? <Text style={styles.cardBodyMuted}>Loading connections...</Text> : null}
        {!loading && connections.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No connections yet.</Text>
        ) : null}
        {visibleConnections.map((connection) => {
          const currentUserId = user.publicUserId;
          const otherUser =
            connection.userAId === currentUserId ? connection.userBId : connection.userAId;
          const canAccept =
            connection.status === "pending" && connection.requestedByUserId !== currentUserId;
          const canDecline = connection.status === "pending";
          const canBlock = connection.status !== "blocked";
          return (
            <View key={connection.id} style={localStyles.personCard}>
              <View style={localStyles.personTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={localStyles.personName}>{personName(otherUser)}</Text>
                  <Text style={localStyles.personId}>{personMeta(otherUser)}</Text>
                </View>
                <Text style={styles.pill}>{connection.status}</Text>
              </View>
              <Text style={localStyles.personMeta}>Requested at: {formatDate(connection.requestedAt)}</Text>
              {connection.status === "accepted" ? (
                <MediaPreviewList
                  items={profileMediaByUserId[otherUser] ?? []}
                  emptyText="No approved profile media yet."
                  testID={`connections-profile-media-${otherUser}`}
                />
              ) : null}
              {canAccept ? (
                <AppButton
                  label="Accept"
                  onPress={() => {
                    void onAccept(connection.id);
                  }}
                  variant="secondary"
                  testID={`connections-accept-${connection.id}`}
                />
              ) : null}
              {canDecline ? (
                <AppButton
                  label={
                    connection.requestedByUserId === currentUserId
                      ? "Withdraw request"
                      : "Decline"
                  }
                  onPress={() => {
                    void onDecline(connection.id);
                  }}
                  variant="secondary"
                  testID={`connections-decline-${connection.id}`}
                />
              ) : null}
              {canBlock ? (
                <AppButton
                  label="Block"
                  onPress={() => {
                    void onBlock(connection.id);
                  }}
                  variant="ghost"
                  testID={`connections-block-${connection.id}`}
                />
              ) : null}
            </View>
          );
        })}
        {nextCursor ? (
          <AppButton
            label={loading ? "Loading connections" : "Load more connections"}
            onPress={() => {
              void loadMore();
            }}
            variant="secondary"
            disabled={loading}
            testID="connections-load-more"
          />
        ) : null}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh connections"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="connections-refresh"
        />
      </SectionCard>
    </ScrollView>
  );
}
