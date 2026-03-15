import {
  acceptConnection,
  AuthenticatedUser,
  blockConnection,
  ConnectionRecord,
  declineConnection,
  discoverConnections,
  listConnections,
  requestConnection,
  searchConnections,
  type ConnectionSearchCandidate
} from "../api";

import {
  shouldForceSignOut,
  asError
} from "../utils";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { useAppTheme } from "../theme-context";
import { MemberAvatar } from "../member-avatar";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    heroTitle: {
      color: colors.ink,
      fontSize: 31,
      lineHeight: 35,
      fontWeight: "800"
    },
    heroBody: {
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
      borderRadius: 22,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    statLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6
    },
    statValue: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "800"
    },
    personCard: {
      borderRadius: 20,
      padding: 14,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 10
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    personName: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700"
    },
    personMeta: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 19
    }
  });
}

function otherMemberId(connection: ConnectionRecord, currentUserId: string): string {
  return connection.otherUser?.userId ?? (connection.userAId === currentUserId ? connection.userBId : connection.userAId);
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
  const [activeTab, setActiveTab] = useState<"discover" | "connections">("discover");
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [discoverPeople, setDiscoverPeople] = useState<ConnectionSearchCandidate[]>([]);
  const [searchResults, setSearchResults] = useState<ConnectionSearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadConnections = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listConnections(accessToken);
      setConnections(rows);
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

  const loadDiscover = useCallback(async (): Promise<void> => {
    setDiscoverLoading(true);
    try {
      const rows = await discoverConnections(accessToken, { limit: 8 });
      setDiscoverPeople(rows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load discover people");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setDiscoverLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void Promise.all([loadConnections(), loadDiscover()]);
  }, [loadConnections, loadDiscover]);

  const pendingConnections = useMemo(
    () => connections.filter((connection) => connection.status === "pending"),
    [connections]
  );
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );
  const shownDiscover = searchResults.length > 0 ? searchResults : discoverPeople;

  const submitRequest = async (payload: { targetUserId?: string; targetQuery?: string }): Promise<void> => {
    setSubmitting(true);
    setSubmitMessage(null);
    setError(null);
    try {
      const connection = await requestConnection(payload, accessToken);
      setConnections((previous) => [connection, ...previous.filter((item) => item.id !== connection.id)]);
      setTargetQuery("");
      setSearchResults([]);
      setSubmitMessage("Connection request sent.");
      await loadDiscover();
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
      setSearchResults(rows);
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
    setError(null);
    try {
      const updated = await acceptConnection(connectionId, accessToken);
      setConnections((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSubmitMessage("Connection accepted.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to accept connection");
      setError(message);
    }
  };

  const onDecline = async (connectionId: string): Promise<void> => {
    setError(null);
    try {
      const updated = await declineConnection(connectionId, accessToken);
      setConnections((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSubmitMessage("Connection updated.");
      await loadDiscover();
    } catch (requestError) {
      const message = asError(requestError, "Unable to update connection");
      setError(message);
    }
  };

  const onBlock = async (connectionId: string): Promise<void> => {
    setError(null);
    try {
      const updated = await blockConnection(connectionId, accessToken);
      setConnections((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSubmitMessage("Person blocked.");
      await loadDiscover();
    } catch (requestError) {
      const message = asError(requestError, "Unable to block person");
      setError(message);
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
        <Text style={styles.pill}>People</Text>
        <Text style={localStyles.heroTitle}>Build your trusted circle</Text>
        <Text style={localStyles.heroBody}>Discover new people first, then manage accepted and pending relationships.</Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="connections-error-banner" /> : null}
      {submitMessage ? <Banner tone="success" message={submitMessage} testID="connections-success-banner" /> : null}

      <View style={localStyles.statRow}>
        <View style={localStyles.statCard}><Text style={localStyles.statLabel}>Connected</Text><Text style={localStyles.statValue}>{acceptedConnections.length}</Text></View>
        <View style={localStyles.statCard}><Text style={localStyles.statLabel}>Pending</Text><Text style={localStyles.statValue}>{pendingConnections.length}</Text></View>
      </View>

      <View style={styles.roleRow}>
        <Pressable style={[styles.roleChip, activeTab === "discover" ? styles.roleChipSelected : null]} onPress={() => setActiveTab("discover")}>
          <Text style={[styles.roleChipLabel, activeTab === "discover" ? styles.roleChipLabelSelected : null]}>Discover</Text>
        </Pressable>
        <Pressable style={[styles.roleChip, activeTab === "connections" ? styles.roleChipSelected : null]} onPress={() => setActiveTab("connections")}>
          <Text style={[styles.roleChipLabel, activeTab === "connections" ? styles.roleChipLabelSelected : null]}>Connections</Text>
        </Pressable>
      </View>

      {activeTab === "discover" ? (
        <>
          <SectionCard title="Find a person">
            <InputField label="Find a person" value={targetQuery} onChangeText={setTargetQuery} placeholder="e.g. Anita, plumber kochi, or member ID" testID="connections-target-user-id" />
            <AppButton label={searching ? "Searching..." : "Search"} onPress={() => { void onSearch(); }} variant="ghost" disabled={searching || submitting} testID="connections-search-submit" />
            <AppButton label={submitting ? "Sending..." : "Send request"} onPress={() => { void onRequest(); }} disabled={submitting} testID="connections-request-submit" />
          </SectionCard>

          <SectionCard title="Discover people">
            {discoverLoading && shownDiscover.length === 0 ? <Text style={styles.cardBodyMuted}>Loading people...</Text> : null}
            {shownDiscover.length === 0 && !discoverLoading ? <Text style={styles.cardBodyMuted}>No discover results yet.</Text> : null}
            {shownDiscover.map((candidate) => (
              <View key={candidate.userId} style={localStyles.personCard}>
                <View style={localStyles.row}>
                  <MemberAvatar name={candidate.displayName} avatar={candidate.avatar} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={localStyles.personName}>{candidate.displayName}</Text>
                    <Text style={localStyles.personMeta}>Member ID: {candidate.userId}</Text>
                    <Text style={localStyles.personMeta}>{candidate.locationLabel ?? "Location coming soon"}</Text>
                  </View>
                </View>
                <View style={styles.roleRow}>
                  {(candidate.topSkills.length > 0 ? candidate.topSkills : ["Profile still adding services"]).map((skill) => (
                    <View key={skill} style={styles.roleChip}><Text style={styles.roleChipLabel}>{skill}</Text></View>
                  ))}
                </View>
                <AppButton label="Request connection" onPress={() => { void submitRequest({ targetUserId: candidate.userId }); }} disabled={submitting} />
              </View>
            ))}
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard title="Accepted connections">
            {acceptedConnections.length === 0 ? <Text style={styles.cardBodyMuted}>No accepted connections yet.</Text> : null}
            {acceptedConnections.map((connection) => {
              const memberId = otherMemberId(connection, user.publicUserId);
              const displayName = connection.otherUser?.displayName ?? memberId;
              return (
                <View key={connection.id} style={localStyles.personCard}>
                  <View style={localStyles.row}>
                    <MemberAvatar name={displayName} avatar={connection.otherUser?.avatar ?? null} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={localStyles.personName}>{displayName}</Text>
                      <Text style={localStyles.personMeta}>Member ID: {memberId}</Text>
                      <Text style={localStyles.personMeta}>{connection.otherUser?.locationLabel ?? "Location not set"}</Text>
                    </View>
                  </View>
                  <View style={styles.roleRow}>
                    {(connection.otherUser?.topSkills ?? []).map((skill) => (
                      <View key={skill} style={styles.roleChip}><Text style={styles.roleChipLabel}>{skill}</Text></View>
                    ))}
                  </View>
                  <AppButton label="Block" onPress={() => { void onBlock(connection.id); }} variant="ghost" />
                </View>
              );
            })}
          </SectionCard>

          <SectionCard title="Pending requests">
            {pendingConnections.length === 0 ? <Text style={styles.cardBodyMuted}>No pending requests.</Text> : null}
            {pendingConnections.map((connection) => {
              const incoming = connection.requestedByUserId !== user.publicUserId;
              const memberId = otherMemberId(connection, user.publicUserId);
              return (
                <View key={connection.id} style={localStyles.personCard}>
                  <Text style={localStyles.personName}>{memberId}</Text>
                  <Text style={localStyles.personMeta}>{incoming ? "Incoming request" : "Waiting for response"}</Text>
                  {incoming ? <AppButton label="Accept" onPress={() => { void onAccept(connection.id); }} /> : null}
                  <AppButton label={incoming ? "Decline" : "Withdraw"} onPress={() => { void onDecline(connection.id); }} variant="secondary" />
                  <AppButton label="Block" onPress={() => { void onBlock(connection.id); }} variant="ghost" />
                </View>
              );
            })}
          </SectionCard>
        </>
      )}

      {loading ? <Text style={styles.cardBodyMuted}>Refreshing people...</Text> : null}
    </ScrollView>
  );
}
