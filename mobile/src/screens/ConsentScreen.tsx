import {
  AccessRequestRecord,
  AuthenticatedUser,
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
} from "../api";
import { asError, shouldForceSignOut } from "../utils";
import { CONSENT_FIELD_LABELS } from "../constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { styles } from "../styles";
import { useAppTheme } from "../theme-context";
import { MemberAvatar } from "../member-avatar";

type PrivacyTab = "current" | "mine" | "theirs" | "history";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    cardGrid: {
      gap: 12
    },
    connectionCard: {
      borderRadius: 20,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 12
    },
    connectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    connectionMeta: {
      flex: 1,
      gap: 3
    },
    connectionName: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "800"
    },
    connectionSubtext: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    summaryCard: {
      flexGrow: 1,
      minWidth: 90,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 4
    },
    summaryLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase"
    },
    summaryValue: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "800"
    },
    detailHero: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14
    },
    tabRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    tabChip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt
    },
    tabChipSelected: {
      borderColor: colors.brand,
      backgroundColor: colors.surface
    },
    tabChipLabel: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700"
    },
    tabChipLabelSelected: {
      color: colors.brand
    },
    matrixHeader: {
      flexDirection: "row",
      paddingHorizontal: 12,
      gap: 8
    },
    matrixHeaderText: {
      flex: 1,
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase"
    },
    matrixRow: {
      flexDirection: "row",
      gap: 8,
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center"
    },
    matrixCellLabel: {
      flex: 1,
      color: colors.ink,
      fontWeight: "700"
    },
    matrixCellValue: {
      flex: 1
    },
    timelineCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    sectionLabel: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: "700"
    }
  });
}

function toggleFieldSelection(fields: ConsentField[], field: ConsentField): ConsentField[] {
  return fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
}

function toOptionalIsoString(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function personIdFromConnection(connection: ConnectionRecord, currentUserId: string): string {
  return connection.otherUser?.userId ?? (connection.userAId === currentUserId ? connection.userBId : connection.userAId);
}

function uniqueFieldCount(grants: ConsentGrantRecord[]): number {
  return new Set(grants.flatMap((grant) => grant.grantedFields)).size;
}

function byNewest(
  left: AccessRequestRecord | ConsentGrantRecord,
  right: AccessRequestRecord | ConsentGrantRecord
): number {
  const leftDate = "createdAt" in left ? left.createdAt : left.grantedAt;
  const rightDate = "createdAt" in right ? right.createdAt : right.grantedAt;
  return new Date(rightDate).getTime() - new Date(leftDate).getTime();
}

export function ConsentScreen({
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
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [activeTab, setActiveTab] = useState<PrivacyTab>("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestFields, setRequestFields] = useState<ConsentField[]>(["phone"]);

  const [grantRequestId, setGrantRequestId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantFields, setGrantFields] = useState<ConsentField[]>(["phone"]);

  const [revokeGrantId, setRevokeGrantId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const currentUserId = user.publicUserId;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [requestRows, grantRows, connectionRows] = await Promise.all([
        listConsentRequests(accessToken),
        listConsentGrants(accessToken),
        listConnections(accessToken)
      ]);
      setRequests(requestRows);
      setGrants(grantRows);
      setConnections(connectionRows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load privacy data");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );

  const connectionCards = useMemo(
    () =>
      acceptedConnections.map((connection) => {
        const otherUserId = personIdFromConnection(connection, currentUserId);
        const personRequests = requests.filter((request) => request.connectionId === connection.id);
        const activeGrants = grants.filter(
          (grant) => grant.connectionId === connection.id && grant.status === "active"
        );
        const grantedByThem = activeGrants.filter((grant) => grant.granteeUserId === currentUserId);
        const grantedByMe = activeGrants.filter((grant) => grant.ownerUserId === currentUserId);
        return {
          connection,
          connectionId: connection.id,
          otherUserId,
          displayName: connection.otherUser?.displayName ?? otherUserId,
          visibleToMeCount: uniqueFieldCount(grantedByThem),
          visibleToThemCount: uniqueFieldCount(grantedByMe),
          pendingRequestCount: personRequests.filter((request) => request.status === "pending").length
        };
      }),
    [acceptedConnections, currentUserId, grants, requests]
  );

  const selectedConnection = useMemo(
    () => connectionCards.find((item) => item.connectionId === selectedConnectionId) ?? null,
    [connectionCards, selectedConnectionId]
  );

  const selectedRequests = useMemo(
    () =>
      requests
        .filter((request) => request.connectionId === selectedConnection?.connectionId)
        .sort(byNewest),
    [requests, selectedConnection]
  );
  const selectedGrants = useMemo(
    () =>
      grants
        .filter((grant) => grant.connectionId === selectedConnection?.connectionId)
        .sort(byNewest),
    [grants, selectedConnection]
  );

  const outgoingRequests = useMemo(
    () => selectedRequests.filter((request) => request.requesterUserId === currentUserId),
    [currentUserId, selectedRequests]
  );

  const incomingRequests = useMemo(
    () => selectedRequests.filter((request) => request.ownerUserId === currentUserId),
    [currentUserId, selectedRequests]
  );

  const pendingIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === "pending"),
    [incomingRequests]
  );

  const activeGrantedToMe = useMemo(
    () =>
      selectedGrants.filter(
        (grant) => grant.status === "active" && grant.granteeUserId === currentUserId
      ),
    [currentUserId, selectedGrants]
  );

  const activeGrantedByMe = useMemo(
    () =>
      selectedGrants.filter(
        (grant) => grant.status === "active" && grant.ownerUserId === currentUserId
      ),
    [currentUserId, selectedGrants]
  );

  const fieldAccessRows = useMemo(
    () =>
      CONSENT_FIELDS.map((field) => ({
        field,
        iCanSee: activeGrantedToMe.some((grant) => grant.grantedFields.includes(field)),
        theyCanSee: activeGrantedByMe.some((grant) => grant.grantedFields.includes(field))
      })),
    [activeGrantedByMe, activeGrantedToMe]
  );

  const historyItems = useMemo(
    () =>
      [...selectedRequests, ...selectedGrants].sort(byNewest).map((item) => {
        if ("requestedFields" in item) {
          return {
            id: item.id,
            type: "request" as const,
            status: item.status,
            title:
              item.requesterUserId === currentUserId
                ? "You requested access"
                : `${selectedConnection?.displayName ?? "Connection"} requested access`,
            fields: item.requestedFields,
            purpose: item.purpose,
            date: item.createdAt
          };
        }

        return {
          id: item.id,
          type: "grant" as const,
          status: item.status,
          title:
            item.ownerUserId === currentUserId
              ? "You granted access"
              : `${selectedConnection?.displayName ?? "Connection"} granted access`,
          fields: item.grantedFields,
          purpose: item.purpose,
          date: item.grantedAt,
          revokedAt: item.revokedAt
        };
      }),
    [currentUserId, selectedConnection?.displayName, selectedGrants, selectedRequests]
  );

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (requestError) {
      const message = asError(requestError, "Privacy action failed");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (): Promise<void> => {
    if (!selectedConnection) {
      setError("Choose a connection first.");
      return;
    }
    await runAction(async () => {
      const created = await requestConsentAccess(
        {
          ownerUserId: selectedConnection.otherUserId,
          connectionId: selectedConnection.connectionId,
          requestedFields: requestFields,
          purpose: requestPurpose.trim()
        },
        accessToken
      );
      setRequests((previous) => [created, ...previous]);
      setRequestPurpose("");
      setSuccess("Access request sent.");
      setActiveTab("mine");
    });
  };

  const onGrant = async (): Promise<void> => {
    if (!grantRequestId.trim()) {
      setError("Choose a pending request to review.");
      return;
    }
    await runAction(async () => {
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
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
      setSuccess("Access granted.");
      setActiveTab("current");
    });
  };

  const onRevoke = async (): Promise<void> => {
    if (!revokeGrantId.trim()) {
      setError("Choose an active grant first.");
      return;
    }
    await runAction(async () => {
      const updated = await revokeConsent(
        revokeGrantId.trim(),
        { reason: revokeReason.trim() },
        accessToken
      );
      setGrants((previous) =>
        previous.map((grant) => (grant.id === updated.id ? updated : grant))
      );
      setRevokeGrantId("");
      setRevokeReason("");
      setSuccess("Access revoked.");
      setActiveTab("history");
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="consent-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Privacy</Text>
        <Text style={styles.screenTitle}>
          {selectedConnection ? `Privacy with ${selectedConnection.displayName}` : "Privacy by connection"}
        </Text>
        <Text style={styles.screenSubtitle}>
          {selectedConnection
            ? "Field-level access, request status, and history all stay in one focused view."
            : "Pick a connected person card to manage access with that person only."}
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="consent-error-banner" /> : null}
      {success ? <Banner tone="success" message={success} testID="consent-success-banner" /> : null}

      <SectionCard title="Connected people" subtitle="Accepted relationships become your privacy cards.">
        {loading ? <Text style={styles.cardBodyMuted}>Loading privacy relationships...</Text> : null}
        {!loading && connectionCards.length === 0 ? (
          <Text style={styles.cardBodyMuted}>
            Accepted connections will appear here once you build your trusted circle.
          </Text>
        ) : !selectedConnection ? (
          <View style={localStyles.cardGrid}>
            {connectionCards.map((item) => (
              <Pressable
                key={item.connectionId}
                style={localStyles.connectionCard}
                onPress={() => {
                  setSelectedConnectionId(item.connectionId);
                  setActiveTab("current");
                  setGrantRequestId("");
                  setRevokeGrantId("");
                }}
                testID={`consent-connection-${item.otherUserId}`}
              >
                <View style={localStyles.connectionHeader}>
                  <MemberAvatar
                    name={item.displayName}
                    avatar={item.connection.otherUser?.avatar ?? null}
                    size={56}
                  />
                  <View style={localStyles.connectionMeta}>
                    <Text style={localStyles.connectionName}>{item.displayName}</Text>
                    <Text style={localStyles.connectionSubtext}>{item.otherUserId}</Text>
                    <Text style={localStyles.connectionSubtext}>
                      {item.connection.otherUser?.locationLabel ?? "Location coming soon"}
                    </Text>
                  </View>
                </View>
                <View style={localStyles.summaryGrid}>
                  <View style={localStyles.summaryCard}>
                    <Text style={localStyles.summaryLabel}>I can see</Text>
                    <Text style={localStyles.summaryValue}>{item.visibleToMeCount}</Text>
                  </View>
                  <View style={localStyles.summaryCard}>
                    <Text style={localStyles.summaryLabel}>They can see</Text>
                    <Text style={localStyles.summaryValue}>{item.visibleToThemCount}</Text>
                  </View>
                  <View style={localStyles.summaryCard}>
                    <Text style={localStyles.summaryLabel}>Pending</Text>
                    <Text style={localStyles.summaryValue}>{item.pendingRequestCount}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </SectionCard>

      {selectedConnection ? (
        <>
          <View style={localStyles.detailHero}>
            <View style={localStyles.connectionHeader}>
              <MemberAvatar
                name={selectedConnection.displayName}
                avatar={selectedConnection.connection.otherUser?.avatar ?? null}
                size={72}
              />
              <View style={localStyles.connectionMeta}>
                <Text style={localStyles.connectionName}>{selectedConnection.displayName}</Text>
                <Text style={localStyles.connectionSubtext}>Member ID: {selectedConnection.otherUserId}</Text>
                <Text style={localStyles.connectionSubtext}>
                  {selectedConnection.connection.otherUser?.topSkills.join(", ") || "Skills coming soon"}
                </Text>
              </View>
            </View>
            <View style={localStyles.summaryGrid}>
              <View style={localStyles.summaryCard}>
                <Text style={localStyles.summaryLabel}>I can see</Text>
                <Text style={localStyles.summaryValue}>{selectedConnection.visibleToMeCount}</Text>
              </View>
              <View style={localStyles.summaryCard}>
                <Text style={localStyles.summaryLabel}>They can see</Text>
                <Text style={localStyles.summaryValue}>{selectedConnection.visibleToThemCount}</Text>
              </View>
            </View>
            <AppButton
              label="Back to connections"
              onPress={() => {
                setSelectedConnectionId("");
                setActiveTab("current");
              }}
              variant="ghost"
              testID="consent-back-to-cards"
            />
          </View>

          <View style={localStyles.tabRow}>
            {[
              { key: "current", label: "Current access" },
              { key: "mine", label: "My requests" },
              { key: "theirs", label: "Their requests" },
              { key: "history", label: "History" }
            ].map((tab) => (
              <Pressable
                key={tab.key}
                style={[
                  localStyles.tabChip,
                  activeTab === tab.key ? localStyles.tabChipSelected : null
                ]}
                onPress={() => setActiveTab(tab.key as PrivacyTab)}
                testID={`consent-tab-${tab.key}`}
              >
                <Text
                  style={[
                    localStyles.tabChipLabel,
                    activeTab === tab.key ? localStyles.tabChipLabelSelected : null
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeTab === "current" ? (
            <SectionCard
              title="Current field access"
              subtitle="See both directions of access without running separate checks."
            >
              <View style={localStyles.matrixHeader}>
                <Text style={localStyles.matrixHeaderText}>Field</Text>
                <Text style={localStyles.matrixHeaderText}>I can see</Text>
                <Text style={localStyles.matrixHeaderText}>They can see</Text>
              </View>
              {fieldAccessRows.map((row) => (
                <View key={row.field} style={localStyles.matrixRow}>
                  <Text style={localStyles.matrixCellLabel}>{CONSENT_FIELD_LABELS[row.field]}</Text>
                  <View style={localStyles.matrixCellValue}>
                    <Text
                      style={styles.dataMeta}
                      testID={`consent-field-${row.field}-mine`}
                    >
                      {row.iCanSee ? "Visible" : "Not shared"}
                    </Text>
                  </View>
                  <View style={localStyles.matrixCellValue}>
                    <Text
                      style={styles.dataMeta}
                      testID={`consent-field-${row.field}-theirs`}
                    >
                      {row.theyCanSee ? "Visible" : "Not shared"}
                    </Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {activeTab === "mine" ? (
            <>
              <SectionCard title="Request access" subtitle="Ask only for the fields you need from this person.">
                <InputField
                  label="Purpose"
                  value={requestPurpose}
                  onChangeText={setRequestPurpose}
                  placeholder="Share phone and email for service coordination"
                  testID="consent-request-purpose"
                />
                <View style={styles.roleRow}>
                  {CONSENT_FIELDS.map((field) => (
                    <Pressable
                      key={field}
                      style={[
                        styles.roleChip,
                        requestFields.includes(field) ? styles.roleChipSelected : null
                      ]}
                      onPress={() =>
                        setRequestFields((previous) => toggleFieldSelection(previous, field))
                      }
                      testID={`consent-request-field-${field}`}
                    >
                      <Text
                        style={[
                          styles.roleChipLabel,
                          requestFields.includes(field) ? styles.roleChipLabelSelected : null
                        ]}
                      >
                        {CONSENT_FIELD_LABELS[field]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <AppButton
                  label={submitting ? "Submitting..." : "Request access"}
                  onPress={() => {
                    void onRequestAccess();
                  }}
                  disabled={submitting || requestFields.length === 0}
                  testID="consent-request-submit"
                />
              </SectionCard>

              <SectionCard title="My request status" subtitle="Pending and past statuses stay visible here.">
                {outgoingRequests.length === 0 ? (
                  <Text style={styles.cardBodyMuted}>No requests sent to this person yet.</Text>
                ) : (
                  outgoingRequests.map((request) => (
                    <View key={request.id} style={localStyles.timelineCard}>
                      <Text style={localStyles.sectionLabel}>{request.status}</Text>
                      <Text style={styles.dataMeta}>
                        Fields: {request.requestedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
                      </Text>
                      <Text style={styles.dataMeta}>Purpose: {request.purpose || "Not provided"}</Text>
                      <Text style={styles.dataMeta}>Created: {formatDate(request.createdAt)}</Text>
                    </View>
                  ))
                )}
              </SectionCard>
            </>
          ) : null}

          {activeTab === "theirs" ? (
            <>
              <SectionCard title="Their requests" subtitle="Incoming requests and past statuses from this connection.">
                {incomingRequests.length === 0 ? (
                  <Text style={styles.cardBodyMuted}>No requests from this person right now.</Text>
                ) : (
                  <View style={styles.stackSmall}>
                    {incomingRequests.map((request) => (
                      <Pressable
                        key={request.id}
                        style={[
                          styles.dataRow,
                          grantRequestId === request.id ? styles.roleChipSelected : null
                        ]}
                        onPress={() => {
                          setGrantRequestId(request.id);
                          setGrantPurpose(request.purpose);
                          setGrantFields(request.requestedFields);
                        }}
                        testID={`consent-grant-request-${request.id}`}
                      >
                        <Text style={styles.dataTitle}>{request.status}</Text>
                        <Text style={styles.dataMeta}>
                          Fields: {request.requestedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
                        </Text>
                        <Text style={styles.dataMeta}>Purpose: {request.purpose || "Not provided"}</Text>
                        <Text style={styles.dataMeta}>Asked {formatDate(request.createdAt)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {pendingIncomingRequests.length > 0 ? (
                  <>
                    <InputField
                      label="Grant purpose"
                      value={grantPurpose}
                      onChangeText={setGrantPurpose}
                      placeholder="Confirmed for the current service request"
                      testID="consent-grant-purpose"
                    />
                    <InputField
                      label="Expiry (optional ISO/local date text)"
                      value={grantExpiresAt}
                      onChangeText={setGrantExpiresAt}
                      placeholder="2026-03-20T18:30"
                      testID="consent-grant-expires"
                    />
                    <View style={styles.roleRow}>
                      {CONSENT_FIELDS.map((field) => (
                        <Pressable
                          key={field}
                          style={[
                            styles.roleChip,
                            grantFields.includes(field) ? styles.roleChipSelected : null
                          ]}
                          onPress={() =>
                            setGrantFields((previous) => toggleFieldSelection(previous, field))
                          }
                          testID={`consent-grant-field-${field}`}
                        >
                          <Text
                            style={[
                              styles.roleChipLabel,
                              grantFields.includes(field) ? styles.roleChipLabelSelected : null
                            ]}
                          >
                            {CONSENT_FIELD_LABELS[field]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <AppButton
                      label={submitting ? "Granting..." : "Grant access"}
                      onPress={() => {
                        void onGrant();
                      }}
                      disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}
                      testID="consent-grant-submit"
                    />
                  </>
                ) : null}
              </SectionCard>

              <SectionCard title="What they can currently see" subtitle="Active grants you can still revoke.">
                {activeGrantedByMe.length === 0 ? (
                  <Text style={styles.cardBodyMuted}>No active grants for this person yet.</Text>
                ) : (
                  <View style={styles.stackSmall}>
                    {activeGrantedByMe.map((grant) => (
                      <Pressable
                        key={grant.id}
                        style={[
                          styles.dataRow,
                          revokeGrantId === grant.id ? styles.roleChipSelected : null
                        ]}
                        onPress={() => setRevokeGrantId(grant.id)}
                        testID={`consent-revoke-grant-${grant.id}`}
                      >
                        <Text style={styles.dataTitle}>
                          {grant.grantedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
                        </Text>
                        <Text style={styles.dataMeta}>Purpose: {grant.purpose || "Not provided"}</Text>
                        <Text style={styles.dataMeta}>
                          Expires: {grant.expiresAt ? formatDate(grant.expiresAt) : "No expiry"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <InputField
                  label="Revoke reason"
                  value={revokeReason}
                  onChangeText={setRevokeReason}
                  placeholder="No longer needed"
                  testID="consent-revoke-reason"
                />
                <AppButton
                  label={submitting ? "Revoking..." : "Revoke selected grant"}
                  onPress={() => {
                    void onRevoke();
                  }}
                  disabled={submitting || revokeGrantId.length === 0}
                  testID="consent-revoke-submit"
                  variant="secondary"
                />
              </SectionCard>
            </>
          ) : null}

          {activeTab === "history" ? (
            <SectionCard title="History with this connection" subtitle="Requests and grants in one readable timeline.">
              {historyItems.length === 0 ? (
                <Text style={styles.cardBodyMuted}>No privacy history yet for this connection.</Text>
              ) : (
                historyItems.map((item) => (
                  <View key={`${item.type}-${item.id}`} style={localStyles.timelineCard}>
                    <Text style={localStyles.sectionLabel}>{item.title}</Text>
                    <Text style={styles.dataMeta}>
                      {item.fields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
                    </Text>
                    <Text style={styles.dataMeta}>Status: {item.status}</Text>
                    <Text style={styles.dataMeta}>Purpose: {item.purpose || "Not provided"}</Text>
                    <Text style={styles.dataMeta}>{formatDate(item.date)}</Text>
                    {"revokedAt" in item && item.revokedAt ? (
                      <Text style={styles.dataMeta}>Revoked: {formatDate(item.revokedAt)}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
