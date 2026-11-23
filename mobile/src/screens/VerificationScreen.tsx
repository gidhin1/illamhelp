import type { JSX } from "react";
import { readyVerificationDocuments, verificationDocumentLabel, verificationDocumentTypes, verificationPrivacy, verificationStatus } from "@illamhelp/shared-types";

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

import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Checkbox } from "react-native-paper";
import * as DocumentPicker from "expo-document-picker";
import { useAppStyles } from "../theme-context";
import { AppButton, Banner, InputField, SectionCard, StatusLabel } from "../components";
import {
  MediaUploadPanel,
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
  const styles = useAppStyles();
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const [reuseDocuments, setReuseDocuments] = useState(false);
  const rejectedRequest = verification?.status === "rejected" ? verification : null;
  const previousDocuments = rejectedRequest
    ? readyVerificationDocuments(documentMediaAssets).filter((item) => rejectedRequest.documentMediaIds.includes(item.id))
    : [];
  const readyDocuments = [
    ...readyVerificationDocuments(documentMediaAssets, rejectedRequest?.createdAt),
    ...(reuseDocuments ? previousDocuments : [])
  ];
  const canSubmitNew = !verification || verification.status === "rejected";

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    setError(null);
    setDocumentError(null);
    try {
      const [record, documentsPage] = await Promise.all([
        getMyVerification(accessToken),
        listVerificationDocumentsPage(accessToken)
      ]);
      setVerification(record);
      setDocumentMediaAssets(documentsPage.items.filter((item) => item.purpose === "verification_document"));
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t load your verification status. Refresh and try again.");
      setLoadError(message);
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
    if (loading || loadError || submitting || documentUploading || pickedDocumentFile || !canSubmitNew) return;
    const ids = readyDocuments.map((item) => item.id);
    if (ids.length === 0) {
      setError("Upload at least one private document, then submit your request.");
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
      setReuseDocuments(false);
      setSuccess("Request sent. Check this page for the review result.");
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t submit your request. Check the document type and try again.");
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
    }).catch(() => {
      setDocumentError("Couldn’t open the file picker. Try choosing the document again.");
      return null;
    });
    if (!result) return;
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    if (!asset?.mimeType || !asset.size) {
      setDocumentError("Choose an image or video with a readable file size.");
      return;
    }
    if (!inferMediaKind(asset.mimeType)) {
      setDocumentError("Choose a photo or video of your document.");
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
    if (documentUploading || submitting || loading || loadError) return;
    if (!pickedDocumentFile) {
      setDocumentError("Choose a private verification document first.");
      return;
    }
    const kind = inferMediaKind(pickedDocumentFile.mimeType);
    if (!kind) {
      setDocumentError("Choose a photo or video of your document.");
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
      setDocumentSuccess("Document uploaded. Submit your request when you’re ready.");
    } catch (requestError) {
      const message = asError(requestError, "Couldn’t upload the document. Choose the file and try again.");
      setDocumentError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setDocumentUploading(false);
    }
  }, [accessToken, documentUploading, loadError, loading, onSessionInvalid, pickedDocumentFile, submitting]);

  const status = verification ? verificationStatus(verification.status) : null;

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="verification-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">Verify your profile</Text>
        <Text style={styles.screenSubtitle}>An approved request adds a verified badge to your profile.</Text>
      </View>
      {loadError ? <Banner tone="error" message={loadError} testID="verification-load-error" /> : null}
      {success ? <Banner tone="success" message={success} testID="verification-success-banner" /> : null}
      {loading && !verification ? <Text style={styles.cardBodyMuted}>Loading verification…</Text> : null}
      {verification && status ? (
        <SectionCard variant="review" title="Current status">
          <StatusLabel label={status.label} tone={status.tone} testID="verification-status" />
          <Text style={styles.cardBodyMuted}>{status.detail}</Text>
          <Text style={styles.dataMeta}>Document type: {verificationDocumentLabel(verification.documentType)}</Text>
          <Text style={styles.dataMeta}>Submitted: {formatDate(verification.createdAt)}</Text>
          {verification.reviewerNotes ? (
            <View style={styles.dataRow}>
              <Text style={styles.dataTitle}>Review feedback</Text>
              <Text style={styles.cardBodyMuted}>{verification.reviewerNotes}</Text>
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      {!loading && !loadError && canSubmitNew ? (
        <>
          <SectionCard title="1. Choose a document type">
            <View style={styles.roleRow}>
              {verificationDocumentTypes.map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[styles.roleChip, documentType === value ? styles.roleChipSelected : null]}
                  disabled={submitting || documentUploading}
                  onPress={() => setDocumentType(value)}
                  testID={`verification-doc-type-${value}`}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: documentType === value, disabled: submitting || documentUploading }}
                >
                  <Text style={[styles.roleChipLabel, documentType === value ? styles.roleChipLabelSelected : null]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
          <SectionCard title="2. Upload your document">
            <MediaUploadPanel
              title="Private verification documents"
              description={verificationPrivacy}
              pickLabel="Add private document"
              uploadLabel="Upload private document"
              pickedFiles={pickedDocumentFile ? [pickedDocumentFile] : []}
              pendingItems={[]}
              uploading={documentUploading}
              error={documentError}
              success={documentSuccess}
              testID="verification-document-upload"
              onPick={() => void onPickDocument()}
              onClear={() => setPickedDocumentFile(null)}
              onRemove={() => setPickedDocumentFile(null)}
              onUpload={() => void onUploadDocument()}
            />
            {previousDocuments.length ? (
              <Checkbox.Item label="Include documents from the last request" status={reuseDocuments ? "checked" : "unchecked"}
                onPress={() => setReuseDocuments(!reuseDocuments)} disabled={submitting || documentUploading} position="leading" />
            ) : null}
            {readyDocuments.length ? (
              <Text accessibilityLiveRegion="polite" style={styles.dataMeta} testID="verification-document-count">
                {readyDocuments.length} private {readyDocuments.length === 1 ? "document" : "documents"} ready to submit.
              </Text>
            ) : null}
          </SectionCard>
          <SectionCard title="3. Send for review">
            {error ? <Banner tone="error" message={error} testID="verification-error-banner" /> : null}
            <InputField label="Notes for the reviewer (optional)" value={notes} onChangeText={setNotes} multiline testID="verification-notes" />
            <Text style={styles.cardBodyMuted}>
              {pickedDocumentFile ? "Upload or remove the selected file before submitting." : readyDocuments.length ? "The reviewer will receive the documents and your notes." : "Upload a private document to enable submission."}
            </Text>
            <AppButton
              label={submitting ? "Submitting…" : "Submit verification request"}
              onPress={() => void onSubmit()}
              disabled={submitting || documentUploading || !!pickedDocumentFile || readyDocuments.length === 0}
              testID="verification-submit"
            />
          </SectionCard>
        </>
      ) : null}

      <AppButton label={loading ? "Refreshing…" : "Refresh verification"} onPress={() => void load()} variant="ghost" disabled={loading || submitting || documentUploading} testID="verification-refresh" />
    </ScrollView>
  );
}
