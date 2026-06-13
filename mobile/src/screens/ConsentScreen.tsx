
import {
  AccessRequestRecord, AuthenticatedUser, canViewConsent, ConnectionRecord,
  CONSENT_FIELDS, ConsentField, ConsentGrantRecord, formatDate, getProfileByUserId, grantConsent,
  listConnections,
  listConsentGrantsPage, listConsentRequestsPage, ProfileRecord, requestConsentAccess, revokeConsent
} from "../api";

import {
  shouldForceSignOut, asError
} from "../utils";

import { CONSENT_FIELD_LABELS } from "../constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard, SkeletonCard } from "../components";

type ConsentView = "sharing" | "requests" | "ask" | "history";

function toOptionalIsoString(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);
  const [requestsCursor, setRequestsCursor] = useState<string | null>(null);
  const [grantsCursor, setGrantsCursor] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRecord>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requestConnectionId, setRequestConnectionId] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestFields, setRequestFields] = useState<ConsentField[]>(["phone"]);

  const [grantRequestId, setGrantRequestId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantFields, setGrantFields] = useState<ConsentField[]>(["phone"]);

  const [revokeGrantId, setRevokeGrantId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const [canViewConnectionId, setCanViewConnectionId] = useState("");
  const [canViewField, setCanViewField] = useState<ConsentField>("phone");
  const [canViewResult, setCanViewResult] = useState<boolean | null>(null);
  const currentUserId = user.publicUserId;
  const [activeView, setActiveView] = useState<ConsentView>("sharing");
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );
  const connectionPeople = useMemo(
    () =>
      acceptedConnections.map((connection) => ({
        connectionId: connection.id,
        memberId:
          connection.userAId === currentUserId ? connection.userBId : connection.userAId
      })),
    [acceptedConnections, currentUserId]
  );
  const personName = useCallback(
    (userId: string): string => profilesByUserId[userId]?.displayName || `Member ${userId}`,
    [profilesByUserId]
  );
  const personMeta = useCallback(
    (userId: string): string => {
      const profile = profilesByUserId[userId];
      if (!profile) return `Member ${userId}`;
      return [
        [profile.city, profile.area].filter(Boolean).join(", "),
        profile.serviceCategories.slice(0, 2).join(", ")
      ].filter(Boolean).join(" · ");
    },
    [profilesByUserId]
  );
  const fieldsText = useCallback(
    (fields: ConsentField[]): string => fields.map((field) => CONSENT_FIELD_LABELS[field]).join(", "),
    []
  );

  useEffect(() => {
    const ids = Array.from(
      new Set([
        ...connectionPeople.map((connection) => connection.memberId),
        ...requests.flatMap((request) => [request.requesterUserId, request.ownerUserId]),
        ...grants.flatMap((grant) => [grant.ownerUserId, grant.granteeUserId])
      ])
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
  }, [accessToken, connectionPeople, grants, profilesByUserId, requests]);
  const pendingIncomingRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "pending" && request.ownerUserId === currentUserId
      ),
    [requests, currentUserId]
  );
  const activeOwnedGrants = useMemo(
    () => grants.filter((grant) => grant.status === "active" && grant.ownerUserId === currentUserId),
    [grants, currentUserId]
  );
  const activeSharedWithMe = useMemo(
    () => grants.filter((grant) => grant.status === "active" && grant.granteeUserId === currentUserId),
    [grants, currentUserId]
  );
  const privacyViews = useMemo(
    () => [
      { key: "sharing" as const, label: "Seeing my details", count: activeOwnedGrants.length },
      { key: "requests" as const, label: "Requests", count: pendingIncomingRequests.length },
      { key: "ask" as const, label: "Ask", count: activeSharedWithMe.length },
      { key: "history" as const, label: "History", count: requests.length + grants.length }
    ],
    [activeOwnedGrants.length, activeSharedWithMe.length, grants.length, pendingIncomingRequests.length, requests.length]
  );
  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [requestPage, grantPage, connectionRows] = await Promise.all([
        listConsentRequestsPage(accessToken),
        listConsentGrantsPage(accessToken),
        listConnections(accessToken)
      ]);
      setRequests(requestPage.items);
      setRequestsCursor(requestPage.nextCursor);
      setGrants(grantPage.items);
      setGrantsCursor(grantPage.nextCursor);
      setConnections(connectionRows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load consent data");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  const loadMoreRequests = async (): Promise<void> => {
    if (!requestsCursor) return;
    const page = await listConsentRequestsPage(accessToken, requestsCursor);
    setRequests((previous) => [...previous, ...page.items]);
    setRequestsCursor(page.nextCursor);
  };

  const loadMoreGrants = async (): Promise<void> => {
    if (!grantsCursor) return;
    const page = await listConsentGrantsPage(accessToken, grantsCursor);
    setGrants((previous) => [...previous, ...page.items]);
    setGrantsCursor(page.nextCursor);
  };

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRequestField = (field: ConsentField): void => {
    setRequestFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field]
    );
  };

  const toggleGrantField = (field: ConsentField): void => {
    setGrantFields((previous) =>
      previous.includes(field) ? previous.filter((item) => item !== field) : [...previous, field]
    );
  };

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (requestError) {
      const message = asError(requestError, "Consent action failed");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (): Promise<void> => {
    await runAction(async () => {
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === requestConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Choose a connected person first.");
      }
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
      setRequestConnectionId("");
      setRequestPurpose("");
      setSuccess("Access request created.");
    });
  };

  const onGrant = async (): Promise<void> => {
    await runAction(async () => {
      if (!grantRequestId.trim()) {
        throw new Error("Choose a pending request first.");
      }
      const payload: {
        grantedFields: ConsentField[];
        purpose: string;
        expiresAt?: string;
      } = {
        grantedFields: grantFields,
        purpose: grantPurpose.trim()
      };
      if (grantExpiresAt.trim()) {
        payload.expiresAt = toOptionalIsoString(grantExpiresAt);
      }
      const grant = await grantConsent(grantRequestId.trim(), payload, accessToken);
      setGrants((previous) => [grant, ...previous]);
      setRequests((previous) =>
        previous.map((item) =>
          item.id === grant.accessRequestId ? { ...item, status: "approved" } : item
        )
      );
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
      setSuccess("Contact details shared.");
    });
  };

  const onRevoke = async (): Promise<void> => {
    await runAction(async () => {
      if (!revokeGrantId.trim()) {
        throw new Error("Choose an active share first.");
      }
      const updated = await revokeConsent(
        revokeGrantId.trim(),
        { reason: revokeReason.trim() },
        accessToken
      );
      setGrants((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setRevokeGrantId("");
      setRevokeReason("");
      setSuccess("Contact sharing stopped.");
    });
  };

  const onCanView = async (): Promise<void> => {
    await runAction(async () => {
      setCanViewResult(null);
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === canViewConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Choose a connected person first.");
      }
      const result = await canViewConsent(
        {
          ownerUserId: selectedConnection.memberId,
          field: canViewField
        },
        accessToken
      );
      setCanViewResult(result.allowed);
      setSuccess("Sharing check completed.");
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
        <Text style={styles.screenTitle}>Share contact details safely</Text>
        <Text style={styles.screenSubtitle}>
          You decide who sees your details and for how long.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="consent-error-banner" /> : null}
      {success ? <Banner tone="success" message={success} testID="consent-success-banner" /> : null}

      <View style={styles.privacyTaskTabs} accessibilityRole="tablist">
        {privacyViews.map((view) => {
          const selected = activeView === view.key;
          return (
            <Pressable
              key={view.key}
              style={[styles.privacyTaskTab, selected ? styles.privacyTaskTabSelected : null]}
              onPress={() => setActiveView(view.key)}
              accessibilityRole="tab"
              accessibilityLabel={`${view.label}, ${view.count}`}
              accessibilityState={{ selected }}
              testID={`consent-view-${view.key}`}
            >
              <Text style={[styles.privacyTaskTabLabel, selected ? styles.privacyTaskTabLabelSelected : null]}>
                {view.label}
              </Text>
              <Text style={[styles.privacyTaskTabCount, selected ? styles.privacyTaskTabCountSelected : null]}>
                {view.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeView === "sharing" ? (
      <SectionCard
        title="People seeing your details"
        subtitle="Stop sharing as soon as the job or visit is complete."
      >
        {activeOwnedGrants.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No one can see your contact details right now.</Text>
        ) : null}
        {activeOwnedGrants.map((grant) => (
          <Pressable
            key={grant.id}
            style={[
              styles.dataRow,
              revokeGrantId === grant.id ? styles.dataRowSelected : null
            ]}
            onPress={() => setRevokeGrantId(grant.id)}
            testID={`consent-revoke-grant-${grant.id}`}
            accessibilityRole="radio"
            accessibilityLabel={`Stop sharing with ${personName(grant.granteeUserId)}`}
            accessibilityState={{ selected: revokeGrantId === grant.id }}
          >
            <Text style={styles.dataTitle}>{personName(grant.granteeUserId)}</Text>
            <Text style={styles.dataMeta}>{personMeta(grant.granteeUserId)}</Text>
            <Text style={styles.dataMeta}>Member ID: {grant.granteeUserId}</Text>
            <Text style={styles.dataMeta}>Can see: {fieldsText(grant.grantedFields)}</Text>
          </Pressable>
        ))}
        {activeOwnedGrants.length > 0 ? (
          <>
            <InputField
              label="Reason for stopping"
              value={revokeReason}
              onChangeText={setRevokeReason}
              placeholder="Service completed"
              testID="consent-revoke-reason"
            />
            <AppButton
              label={submitting ? "Stopping sharing..." : "Stop sharing details"}
              onPress={() => {
                void onRevoke();
              }}
              variant="secondary"
              disabled={submitting || revokeGrantId.length === 0}
              testID="consent-revoke-submit"
            />
          </>
        ) : null}
      </SectionCard>
      ) : null}

      {activeView === "requests" ? (
      <SectionCard
        title="Requests waiting for you"
        subtitle="Approve only the contact details needed for the job or visit."
      >
        <View style={styles.roleRow}>
          {pendingIncomingRequests.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No pending requests for you.</Text>
          ) : null}
          {pendingIncomingRequests.map((request) => (
            <Pressable
              key={request.id}
              style={[
                styles.roleChip,
                grantRequestId === request.id ? styles.roleChipSelected : null
              ]}
              onPress={() => setGrantRequestId(request.id)}
              testID={`consent-grant-request-${request.id}`}
              accessibilityRole="radio"
              accessibilityLabel={`Approve request from ${personName(request.requesterUserId)}`}
              accessibilityState={{ selected: grantRequestId === request.id }}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  grantRequestId === request.id ? styles.roleChipLabelSelected : null
                ]}
              >
                {personName(request.requesterUserId)}
              </Text>
            </Pressable>
          ))}
        </View>
        {pendingIncomingRequests.map((request) => (
          grantRequestId === request.id ? (
            <View key={`request-detail-${request.id}`} style={styles.dataRow}>
              <Text style={styles.dataTitle}>{personName(request.requesterUserId)}</Text>
              <Text style={styles.dataMeta}>{personMeta(request.requesterUserId)}</Text>
              <Text style={styles.dataMeta}>Member ID: {request.requesterUserId}</Text>
              <Text style={styles.dataMeta}>Asking for: {fieldsText(request.requestedFields)}</Text>
              <Text style={styles.dataMeta}>Reason: {request.purpose}</Text>
            </View>
          ) : null
        ))}
        {pendingIncomingRequests.length > 0 ? (
          <>
            <InputField
              label="Why you are approving"
              value={grantPurpose}
              onChangeText={setGrantPurpose}
              placeholder="Approved for one-time call"
              testID="consent-grant-purpose"
            />
            <InputField
              label="Access ends after (optional)"
              value={grantExpiresAt}
              onChangeText={setGrantExpiresAt}
              placeholder="Example: 2026-12-31 23:59"
              testID="consent-grant-expires-at"
            />
            <View style={styles.roleRow}>
              {CONSENT_FIELDS.map((field) => (
                <Pressable
                  key={field}
                  style={[
                    styles.roleChip,
                    grantFields.includes(field) ? styles.roleChipSelected : null
                  ]}
                  onPress={() => toggleGrantField(field)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Share ${CONSENT_FIELD_LABELS[field]}`}
                  accessibilityState={{ checked: grantFields.includes(field) }}
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
              label={submitting ? "Sharing details..." : "Share selected details"}
              onPress={() => {
                void onGrant();
              }}
              disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}
              testID="consent-grant-submit"
            />
          </>
        ) : null}
      </SectionCard>
      ) : null}

      {activeView === "ask" ? (
      <>
      <SectionCard
        title="Request contact details"
        subtitle="Ask for the smallest set of details needed for a job or visit."
      >
        <Text style={styles.fieldLabel}>Choose person</Text>
        <View style={styles.roleRow}>
          {connectionPeople.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No accepted connections yet.</Text>
          ) : null}
          {connectionPeople.map((item) => (
            <Pressable
              key={item.connectionId}
              style={[
                styles.roleChip,
                requestConnectionId === item.connectionId ? styles.roleChipSelected : null
              ]}
              onPress={() => setRequestConnectionId(item.connectionId)}
              testID={`consent-request-owner-${item.memberId}`}
              accessibilityRole="radio"
              accessibilityLabel={`Request details from ${personName(item.memberId)}`}
              accessibilityState={{ selected: requestConnectionId === item.connectionId }}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  requestConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {personName(item.memberId)}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Why you need this"
          value={requestPurpose}
          onChangeText={setRequestPurpose}
          placeholder="Need address to arrive"
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
              onPress={() => toggleRequestField(field)}
              accessibilityRole="checkbox"
              accessibilityLabel={`Request ${CONSENT_FIELD_LABELS[field]}`}
              accessibilityState={{ checked: requestFields.includes(field) }}
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
          label={submitting ? "Sending request..." : "Request contact details"}
          onPress={() => {
            void onRequestAccess();
          }}
          disabled={submitting || requestFields.length === 0 || requestConnectionId.length === 0}
          testID="consent-request-submit"
        />
      </SectionCard>

      <SectionCard title="People who shared with you">
        {activeSharedWithMe.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No contact details are shared with you right now.</Text>
        ) : null}
        {activeSharedWithMe.map((grant) => (
          <View key={grant.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>{personName(grant.ownerUserId)}</Text>
            <Text style={styles.dataMeta}>{personMeta(grant.ownerUserId)}</Text>
            <Text style={styles.dataMeta}>Member ID: {grant.ownerUserId}</Text>
            <Text style={styles.dataMeta}>Shared with you: {fieldsText(grant.grantedFields)}</Text>
          </View>
        ))}
      </SectionCard>
      </>
      ) : null}

      {activeView === "history" ? (
      <>
      <SectionCard title="Check sharing status">
        <Text style={styles.fieldLabel}>Connected person</Text>
        <View style={styles.roleRow}>
          {connectionPeople.map((item) => (
            <Pressable
              key={`check-${item.connectionId}`}
              style={[
                styles.roleChip,
                canViewConnectionId === item.connectionId ? styles.roleChipSelected : null
              ]}
              onPress={() => setCanViewConnectionId(item.connectionId)}
              testID={`consent-can-view-owner-${item.memberId}`}
              accessibilityRole="radio"
              accessibilityLabel={`Check sharing for ${personName(item.memberId)}`}
              accessibilityState={{ selected: canViewConnectionId === item.connectionId }}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  canViewConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {personName(item.memberId)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.roleRow}>
          {CONSENT_FIELDS.map((field) => (
            <Pressable
              key={field}
              style={[styles.roleChip, canViewField === field ? styles.roleChipSelected : null]}
              onPress={() => setCanViewField(field)}
              testID={`consent-can-view-field-${field}`}
              accessibilityRole="radio"
              accessibilityLabel={`Check ${CONSENT_FIELD_LABELS[field]} sharing`}
              accessibilityState={{ selected: canViewField === field }}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  canViewField === field ? styles.roleChipLabelSelected : null
                ]}
              >
                {CONSENT_FIELD_LABELS[field]}
              </Text>
            </Pressable>
          ))}
        </View>
        <AppButton
          label={submitting ? "Checking sharing..." : "Check sharing"}
          onPress={() => {
            void onCanView();
          }}
          disabled={submitting || canViewConnectionId.length === 0}
          testID="consent-can-view-submit"
        />
        {canViewResult !== null ? (
          <Banner
            tone={canViewResult ? "success" : "info"}
            message={
              canViewResult
                ? "This contact detail is available to you."
                : "This contact detail is not available right now."
            }
            testID={canViewResult ? "consent-can-view-allowed-banner" : "consent-can-view-denied-banner"}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Recent privacy records">
        {loading ? <SkeletonCard /> : null}
        {!loading && requests.length === 0 && grants.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No contact sharing records yet.</Text>
        ) : null}
        {requests.map((request) => (
          <View key={request.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Request · {request.status}</Text>
            <Text style={styles.dataMeta}>
              {personName(request.requesterUserId)} asked {personName(request.ownerUserId)}
            </Text>
            <Text style={styles.dataMeta}>
              {personMeta(request.requesterUserId)}
            </Text>
            <Text style={styles.dataMeta}>
              Details:{" "}
              {request.requestedFields
                .map((field) => CONSENT_FIELD_LABELS[field])
                .join(", ")}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(request.createdAt)}</Text>
          </View>
        ))}
        {requestsCursor ? (
          <AppButton
            label="Load more requests"
            onPress={() => {
              void loadMoreRequests();
            }}
            variant="secondary"
            testID="consent-load-more-requests"
          />
        ) : null}
        {grants.map((grant) => (
          <View key={grant.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Shared details · {grant.status}</Text>
            <Text style={styles.dataMeta}>
              {personName(grant.ownerUserId)} shared with {personName(grant.granteeUserId)}
            </Text>
            <Text style={styles.dataMeta}>
              {personMeta(grant.granteeUserId)}
            </Text>
            <Text style={styles.dataMeta}>
              Details: {grant.grantedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(grant.grantedAt)}</Text>
          </View>
        ))}
        {grantsCursor ? (
          <AppButton
            label="Load more sharing history"
            onPress={() => {
              void loadMoreGrants();
            }}
            variant="secondary"
            testID="consent-load-more-grants"
          />
        ) : null}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh sharing data"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="consent-refresh"
        />
      </SectionCard>
      </>
      ) : null}
    </ScrollView>
  );
}
