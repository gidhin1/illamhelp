import { Image, ScrollView, Text, View } from "react-native";

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
  cameraLabel = "Take photo or video",
  uploadLabel,
  pickedFiles,
  pendingItems,
  uploading,
  error,
  success,
  testID,
  onPick,
  onCameraPick,
  onClear,
  onRemove,
  onUpload
}: {
  title: string;
  description: string;
  pickLabel: string;
  cameraLabel?: string;
  uploadLabel: string;
  pickedFiles: PickedMediaFile[];
  pendingItems: OwnerMedia[];
  uploading: boolean;
  error: string | null;
  success: string | null;
  testID: string;
  onPick: () => void;
  onCameraPick?: () => void;
  onClear: () => void;
  onRemove?: (index: number) => void;
  onUpload: () => void;
}): JSX.Element {
  const styles = useAppStyles();
  const pickedCount = pickedFiles.length;
  const photoCount = pickedFiles.filter((file) => file.mimeType.startsWith("image/")).length;
  const videoCount = pickedFiles.filter((file) => file.mimeType.startsWith("video/")).length;

  return (
    <View style={styles.mediaUploadPanel} testID={testID}>
      <View style={styles.stackSmall}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBodyMuted}>{description}</Text>
      </View>
      {error ? <Banner tone="error" message={error} testID={`${testID}-error`} /> : null}
      {success ? <Banner tone="success" message={success} testID={`${testID}-success`} /> : null}
      <View style={styles.mediaPickerActions}>
        {onCameraPick ? (
          <AppButton
            label={cameraLabel}
            onPress={onCameraPick}
            variant="secondary"
            disabled={uploading}
            testID={`${testID}-camera`}
          />
        ) : null}
        <AppButton
          label={pickLabel}
          onPress={onPick}
          variant="secondary"
          disabled={uploading}
          testID={`${testID}-pick`}
        />
      </View>
      {pickedCount > 0 ? (
        <View style={styles.mediaSelectedRow} testID={`${testID}-selected`}>
          <View style={styles.mediaSelectedSummary}>
            <Text style={styles.dataTitle}>
              {pickedCount} selected {pickedCount === 1 ? "file" : "files"}
            </Text>
            <Text style={styles.dataMeta}>{photoCount} photos · {videoCount} videos · automatic ordering</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaSelectionRail}>
            {pickedFiles.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.mediaSelectionCard}>
                <View style={styles.mediaSelectionFrame}>
                {file.mimeType.startsWith("image/") ? (
                  <Image source={{ uri: file.uri }} style={styles.mediaSelectionImage} resizeMode="cover" />
                ) : (
                  <View style={styles.mediaSelectionVideo}>
                    <Text style={styles.mediaPreviewVideoLabel}>Video</Text>
                  </View>
                )}
                  <View style={styles.mediaKindPill}>
                    <Text style={styles.mediaKindPillText}>{pickedKindLabel(file)}</Text>
                  </View>
                </View>
                <Text style={styles.dataTitle} numberOfLines={1}>{file.name}</Text>
                <Text style={styles.dataMeta}>{pickedKindLabel(file)} · {formatBytes(file.size)}</Text>
                {onRemove ? (
                  <AppButton
                    label="Remove"
                    onPress={() => onRemove(index)}
                    variant="ghost"
                    disabled={uploading}
                    testID={`${testID}-remove-${index}`}
                  />
                ) : null}
              </View>
            ))}
          </ScrollView>
          <View style={styles.mediaUploadActions}>
            <AppButton
              label="Clear selection"
              onPress={onClear}
              variant="ghost"
              disabled={uploading}
              testID={`${testID}-clear`}
            />
            <AppButton
              label={uploading ? "Uploading..." : pickedCount > 1 ? `Upload ${pickedCount} files` : uploadLabel}
              onPress={onUpload}
              loading={uploading}
              disabled={uploading}
              testID={`${testID}-upload`}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.cardBodyMuted}>Take media now or choose several photos and videos from this device.</Text>
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
