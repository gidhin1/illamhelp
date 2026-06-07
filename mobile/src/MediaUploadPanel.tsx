import { Text, View } from "react-native";

import type { MediaAssetRecord, PublicMediaAssetRecord } from "./api";
import { AppButton, Banner } from "./components";
import { formatBytes } from "./utils";
import { useAppStyles } from "./theme-context";

export interface PickedMediaFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

type OwnerMedia = MediaAssetRecord | PublicMediaAssetRecord;

const REVIEW_STATES = new Set(["uploaded", "scanning", "ai_reviewed", "human_review_pending"]);

function stateLabel(state: string): string {
  return state.replace(/_/g, " ");
}

function mediaTitle(asset: OwnerMedia): string {
  if ("objectKey" in asset) {
    return asset.objectKey.split("/").slice(-1)[0] || asset.id;
  }
  return asset.id;
}

function pickedKindLabel(file: PickedMediaFile): string {
  if (file.mimeType.startsWith("image/")) return "Photo";
  if (file.mimeType.startsWith("video/")) return "Video";
  return "File";
}

export function pendingReviewMedia<TMedia extends OwnerMedia>(items: TMedia[]): TMedia[] {
  return items.filter((item) => REVIEW_STATES.has(item.state));
}

export function approvedMedia<TMedia extends OwnerMedia>(items: TMedia[]): TMedia[] {
  return items.filter((item) => item.state === "approved");
}

export function MediaUploadPanel({
  title,
  description,
  pickLabel,
  uploadLabel,
  pickedFile,
  pendingItems,
  uploading,
  error,
  success,
  testID,
  onPick,
  onClear,
  onUpload
}: {
  title: string;
  description: string;
  pickLabel: string;
  uploadLabel: string;
  pickedFile: PickedMediaFile | null;
  pendingItems: OwnerMedia[];
  uploading: boolean;
  error: string | null;
  success: string | null;
  testID: string;
  onPick: () => void;
  onClear: () => void;
  onUpload: () => void;
}): JSX.Element {
  const styles = useAppStyles();

  return (
    <View style={styles.mediaUploadPanel} testID={testID}>
      <View style={styles.stackSmall}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBodyMuted}>{description}</Text>
      </View>
      {error ? <Banner tone="error" message={error} testID={`${testID}-error`} /> : null}
      {success ? <Banner tone="success" message={success} testID={`${testID}-success`} /> : null}
      <AppButton
        label={pickLabel}
        onPress={onPick}
        variant="secondary"
        disabled={uploading}
        testID={`${testID}-pick`}
      />
      {pickedFile ? (
        <View style={styles.mediaSelectedRow} testID={`${testID}-selected`}>
          <View style={styles.mediaFileIcon}>
            <Text style={styles.mediaFileIconText}>{pickedKindLabel(pickedFile).slice(0, 1)}</Text>
          </View>
          <View style={styles.mediaPreviewMeta}>
            <Text style={styles.dataTitle}>{pickedFile.name}</Text>
            <Text style={styles.dataMeta}>
              {pickedKindLabel(pickedFile)} · {formatBytes(pickedFile.size)}
            </Text>
          </View>
          <View style={styles.mediaUploadActions}>
            <AppButton
              label="Remove file"
              onPress={onClear}
              variant="ghost"
              disabled={uploading}
              testID={`${testID}-clear`}
            />
            <AppButton
              label={uploading ? "Uploading..." : uploadLabel}
              onPress={onUpload}
              loading={uploading}
              disabled={uploading}
              testID={`${testID}-upload`}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.cardBodyMuted}>Choose an image or video, then upload it for review.</Text>
      )}
      {pendingItems.length > 0 ? (
        <View style={styles.stackSmall} testID={`${testID}-pending`}>
          <Text style={styles.fieldLabel}>Pending review</Text>
          {pendingItems.map((asset) => (
            <View key={asset.id} style={styles.mediaPendingRow}>
              <Text style={styles.dataTitle}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
              <Text style={styles.dataMeta}>{mediaTitle(asset)}</Text>
              <Text style={styles.dataMeta}>{stateLabel(asset.state)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
