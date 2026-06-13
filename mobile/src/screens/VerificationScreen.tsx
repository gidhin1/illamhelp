
import {
  completeMediaUpload,
  createMediaUploadTicket,
  formatDate,
  getMyVerification,
  listVerificationDocumentsPage,
  MediaAssetRecord,
  MediaKind,
  submitVerification,
  VerificationRecord
} from "../api";

import {
  randomHex,
  shouldForceSignOut, asError
} from "../utils";

import {
  VERIFICATION_STATUS_LABELS
} from "../constants";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import {
  MediaUploadPanel,
  pendingReviewMedia,
  PickedMediaFile
} from "../MediaUploadPanel";

function inferMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

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
  const [documentMediaAssets, setDocumentMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [pickedDocumentFile, setPickedDocumentFile] = useState<PickedMediaFile | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentSuccess, setDocumentSuccess] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setDocumentError(null);
    try {
      const [record, documentsPage] = await Promise.all([
        getMyVerification(accessToken),
        listVerificationDocumentsPage(accessToken).catch(() => ({ items: [], nextCursor: null }))
      ]);
      setVerification(record);
      setDocumentMediaAssets(documentsPage.items.filter((item) => item.purpose === "verification_document"));
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
    const ids = documentMediaAssets
      .filter((item) => item.purpose === "verification_document" && item.state !== "rejected")
      .map((item) => item.id);
    if (ids.length === 0) {
      setError("Upload at least one private document before submitting verification.");
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

  const onPickDocument = useCallback(async (): Promise<void> => {
    setDocumentError(null);
    setDocumentSuccess(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: false,
      copyToCacheDirectory: true
    });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    if (!asset?.mimeType || !asset.size) {
      setDocumentError("Choose an image or video with a readable file size.");
      return;
    }
    if (!inferMediaKind(asset.mimeType)) {
      setDocumentError("Only identity images and videos are supported.");
      return;
    }
    setPickedDocumentFile({
      uri: asset.uri,
      name: asset.name || `verification-document-${Date.now()}`,
      mimeType: asset.mimeType,
      size: asset.size
    });
  }, []);

  const onUploadDocument = useCallback(async (): Promise<void> => {
    if (!pickedDocumentFile) {
      setDocumentError("Choose a private verification document first.");
      return;
    }
    const kind = inferMediaKind(pickedDocumentFile.mimeType);
    if (!kind) {
      setDocumentError("Only identity images and videos are supported.");
      return;
    }

    setDocumentUploading(true);
    setDocumentError(null);
    setDocumentSuccess(null);
    try {
      const ticket = await createMediaUploadTicket(
        {
          kind,
          purpose: "verification_document",
          contentType: pickedDocumentFile.mimeType,
          fileSizeBytes: pickedDocumentFile.size,
          checksumSha256: randomHex(64),
          originalFileName: pickedDocumentFile.name
        },
        accessToken
      );

      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body: {
          uri: pickedDocumentFile.uri,
          name: pickedDocumentFile.name,
          type: pickedDocumentFile.mimeType
        } as unknown as RequestInit["body"]
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      const etag = uploadResponse.headers.get("etag")?.replace(/"/g, "");
      const completed = await completeMediaUpload(
        ticket.mediaId,
        { etag: etag || undefined },
        accessToken
      );

      setDocumentMediaAssets((previous) => [
        completed,
        ...previous.filter((item) => item.id !== completed.id)
      ]);
      setPickedDocumentFile(null);
      setDocumentSuccess("Private document uploaded for verification review.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload verification document");
      setDocumentError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setDocumentUploading(false);
    }
  }, [accessToken, onSessionInvalid, pickedDocumentFile]);

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
          Upload private identity documents, then submit them for trusted review.
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
            <Text style={styles.dataMeta}>Privacy: private verification review only</Text>
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
            Add ID, certificate, license, or address-proof files here. They stay out of profile media and only appear in verification review.
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
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected: documentType === value }}
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
          <MediaUploadPanel
            title="Private verification documents"
            description="Choose an image or video from this device, then upload it privately for review."
            pickLabel="Add private document"
            uploadLabel="Upload private document"
            pickedFiles={pickedDocumentFile ? [pickedDocumentFile] : []}
            pendingItems={pendingReviewMedia(documentMediaAssets)}
            uploading={documentUploading}
            error={documentError}
            success={documentSuccess}
            testID="verification-document-upload"
            onPick={() => {
              void onPickDocument();
            }}
            onClear={() => setPickedDocumentFile(null)}
            onRemove={() => setPickedDocumentFile(null)}
            onUpload={() => {
              void onUploadDocument();
            }}
          />
          {documentMediaAssets.length > 0 ? (
            <Text style={styles.dataMeta} testID="verification-document-count">
              {documentMediaAssets.length} private document{documentMediaAssets.length === 1 ? "" : "s"} ready for submission.
            </Text>
          ) : null}
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
            disabled={submitting || documentUploading}
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
