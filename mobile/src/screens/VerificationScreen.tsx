
import {
  formatDate, getMyVerification,
  submitVerification, VerificationRecord
} from "../api";

import {
  shouldForceSignOut, asError
} from "../utils";

import {
  VERIFICATION_STATUS_LABELS
} from "../constants";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";

export function VerificationScreen({
  accessToken,
  onSessionInvalid
}: {
  accessToken: string;
  onSessionInvalid: () => void;
}): JSX.Element {
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState("government_id");
  const [documentMediaIds, setDocumentMediaIds] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const record = await getMyVerification(accessToken);
      setVerification(record);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load verification status");
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

  const onSubmit = async (): Promise<void> => {
    const ids = documentMediaIds
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (ids.length === 0) {
      setError("Enter at least one document media ID.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await submitVerification(
        {
          documentType,
          documentMediaIds: ids,
          notes: notes.trim() || undefined
        },
        accessToken
      );
      setVerification(created);
      setSuccess("Verification request submitted.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to submit verification request");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitNew = !verification || verification.status === "rejected";
  const statusLabel =
    verification && VERIFICATION_STATUS_LABELS[verification.status]
      ? VERIFICATION_STATUS_LABELS[verification.status]
      : verification?.status ?? "-";

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="verification-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Verification</Text>
        <Text style={styles.screenTitle}>Get verified</Text>
        <Text style={styles.screenSubtitle}>
          Submit identity documents to unlock trusted badges on your profile.
        </Text>
      </View>
      {error ? <Banner tone="error" message={error} testID="verification-error-banner" /> : null}
      {success ? (
        <Banner tone="success" message={success} testID="verification-success-banner" />
      ) : null}

      <SectionCard title="Current status">
        {loading ? <Text style={styles.cardBodyMuted}>Loading verification...</Text> : null}
        {!loading && !verification ? (
          <Text style={styles.cardBodyMuted}>No verification request yet.</Text>
        ) : null}
        {!loading && verification ? (
          <View style={styles.dataRow}>
            <Text style={styles.dataTitle}>Status: {statusLabel}</Text>
            <Text style={styles.dataMeta}>
              Document type: {verification.documentType.replaceAll("_", " ")}
            </Text>
            <Text style={styles.dataMeta}>
              Documents: {verification.documentMediaIds.length} file(s)
            </Text>
            {verification.notes ? (
              <Text style={styles.dataMeta}>Your notes: {verification.notes}</Text>
            ) : null}
            <Text style={styles.dataMeta}>Submitted: {formatDate(verification.createdAt)}</Text>
            {verification.reviewerNotes ? (
              <Text style={styles.dataMeta}>Reviewer notes: {verification.reviewerNotes}</Text>
            ) : null}
            {verification.reviewedAt ? (
              <Text style={styles.dataMeta}>Reviewed: {formatDate(verification.reviewedAt)}</Text>
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      {canSubmitNew ? (
        <SectionCard title={verification?.status === "rejected" ? "Resubmit request" : "Submit request"}>
          <Text style={styles.cardBodyMuted}>
            Upload your documents from Profile → Professional media first, then paste media IDs here.
          </Text>
          <Text style={styles.fieldLabel}>Document type</Text>
          <View style={styles.roleRow}>
            {[
              ["government_id", "Government ID"],
              ["professional_certification", "Professional cert"],
              ["business_license", "Business license"],
              ["utility_bill", "Utility bill"]
            ].map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.roleChip, documentType === value ? styles.roleChipSelected : null]}
                onPress={() => setDocumentType(value)}
                testID={`verification-doc-type-${value}`}
              >
                <Text
                  style={[
                    styles.roleChipLabel,
                    documentType === value ? styles.roleChipLabelSelected : null
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <InputField
            label="Document media IDs"
            value={documentMediaIds}
            onChangeText={setDocumentMediaIds}
            placeholder="media-id-1, media-id-2"
            testID="verification-media-ids"
          />
          <InputField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional context for reviewer."
            multiline
            testID="verification-notes"
          />
          <AppButton
            label={submitting ? "Submitting..." : "Submit verification request"}
            onPress={() => {
              void onSubmit();
            }}
            disabled={submitting}
            testID="verification-submit"
          />
        </SectionCard>
      ) : null}

      <AppButton
        label={loading ? "Refreshing..." : "Refresh verification"}
        onPress={() => {
          void load();
        }}
        variant="ghost"
        disabled={loading}
        testID="verification-refresh"
      />
    </ScrollView>
  );
}
