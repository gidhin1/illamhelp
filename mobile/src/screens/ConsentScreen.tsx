
import {
  AccessRequestRecord, AuthenticatedUser, canViewConsent, ConnectionRecord,
  CONSENT_FIELDS, ConsentField, ConsentGrantRecord, formatDate, grantConsent,
  listConnections,
  listConsentGrants, listConsentRequests, requestConsentAccess, revokeConsent
} from "../api";

import {
  shouldForceSignOut, asError
} from "../utils";

import {
  CONSENT_FIELD_LABELS, MAX_RENDER_ROWS
} from "../constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";

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
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
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
  const visibleRequests = useMemo(
    () => requests.slice(0, MAX_RENDER_ROWS),
    [requests]
  );
  const visibleGrants = useMemo(
    () => grants.slice(0, MAX_RENDER_ROWS),
    [grants]
  );

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
      const message = asError(requestError, "Unable to load consent data");
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
        payload.expiresAt = grantExpiresAt.trim();
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
      setSuccess("Consent granted.");
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
      setSuccess("Consent revoked.");
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
      setSuccess("Visibility check completed.");
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

      <SectionCard title="Request access">
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
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  requestConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {item.memberId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Why you need this"
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
              onPress={() => toggleRequestField(field)}
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
          disabled={submitting || requestFields.length === 0 || requestConnectionId.length === 0}
          testID="consent-request-submit"
        />
      </SectionCard>

      <SectionCard title="Grant access">
        <Text style={styles.fieldLabel}>Pending requests</Text>
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
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  grantRequestId === request.id ? styles.roleChipLabelSelected : null
                ]}
              >
                {request.requesterUserId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Why you are approving"
          value={grantPurpose}
          onChangeText={setGrantPurpose}
          placeholder="Approved for one-time call"
          testID="consent-grant-purpose"
        />
        <InputField
          label="Ends on (ISO, optional)"
          value={grantExpiresAt}
          onChangeText={setGrantExpiresAt}
          placeholder="2026-12-31T23:59:59.000Z"
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
          label={submitting ? "Submitting..." : "Grant"}
          onPress={() => {
            void onGrant();
          }}
          variant="secondary"
          disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}
          testID="consent-grant-submit"
        />
      </SectionCard>

      <SectionCard title="Stop sharing + access check">
        <Text style={styles.fieldLabel}>Active shares</Text>
        <View style={styles.roleRow}>
          {activeOwnedGrants.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No active shares to revoke.</Text>
          ) : null}
          {activeOwnedGrants.map((grant) => (
            <Pressable
              key={grant.id}
              style={[
                styles.roleChip,
                revokeGrantId === grant.id ? styles.roleChipSelected : null
              ]}
              onPress={() => setRevokeGrantId(grant.id)}
              testID={`consent-revoke-grant-${grant.id}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  revokeGrantId === grant.id ? styles.roleChipLabelSelected : null
                ]}
              >
                {grant.granteeUserId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Revoke reason"
          value={revokeReason}
          onChangeText={setRevokeReason}
          placeholder="No longer required"
          testID="consent-revoke-reason"
        />
        <AppButton
          label={submitting ? "Submitting..." : "Revoke"}
          onPress={() => {
            void onRevoke();
          }}
          variant="secondary"
          disabled={submitting || revokeGrantId.length === 0}
          testID="consent-revoke-submit"
        />

        <Text style={styles.fieldLabel}>Check a connected person</Text>
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
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  canViewConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {item.memberId}
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
          label={submitting ? "Submitting..." : "Can view check"}
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
        {loading ? <Text style={styles.cardBodyMuted}>Loading consent records...</Text> : null}
        {!loading && requests.length === 0 && grants.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No consent records yet.</Text>
        ) : null}
        {!loading && requests.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {requests.length} requests.
          </Text>
        ) : null}
        {!loading && grants.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {grants.length} grants.
          </Text>
        ) : null}
        {visibleRequests.map((request) => (
          <View key={request.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Request · {request.status}</Text>
            <Text style={styles.dataMeta}>
              {request.requesterUserId} asked {request.ownerUserId}
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
        {visibleGrants.map((grant) => (
          <View key={grant.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Grant · {grant.status}</Text>
            <Text style={styles.dataMeta}>
              {grant.ownerUserId} shared with {grant.granteeUserId}
            </Text>
            <Text style={styles.dataMeta}>
              Details: {grant.grantedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(grant.grantedAt)}</Text>
          </View>
        ))}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh consent data"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="consent-refresh"
        />
      </SectionCard>
    </ScrollView>
  );
}
