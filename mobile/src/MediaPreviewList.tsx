import { Image, Linking, Text, View } from "react-native";

import type { PublicMediaAssetRecord } from "./api";
import { AppButton } from "./components";
import { formatBytes } from "./utils";
import { useAppStyles } from "./theme-context";

export function MediaPreviewList({
  items,
  emptyText = "No approved media yet.",
  testID
}: {
  items: PublicMediaAssetRecord[];
  emptyText?: string;
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();
  const purposeLabel = (purpose: string) => purpose.replace(/_/g, " ");

  if (items.length === 0) {
    return (
      <Text style={styles.cardBodyMuted} testID={testID ? `${testID}-empty` : undefined}>
        {emptyText}
      </Text>
    );
  }

  return (
    <View style={styles.stackSmall} testID={testID}>
      {items.map((asset) => (
        <View key={asset.id} style={styles.mediaPreviewRow} testID={testID ? `${testID}-item` : undefined}>
          {asset.kind === "image" ? (
            <Image
              source={{ uri: asset.downloadUrl }}
              style={styles.mediaPreviewImage}
              resizeMode="cover"
              accessibilityLabel={`Approved ${purposeLabel(asset.purpose)} photo`}
            />
          ) : (
            <View
              style={styles.mediaPreviewVideo}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Approved ${purposeLabel(asset.purpose)} video preview`}
            >
              <Text style={styles.mediaPreviewVideoLabel}>Video</Text>
            </View>
          )}
          <View style={styles.mediaPreviewMeta}>
            <Text style={styles.dataTitle}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
            <Text style={styles.dataMeta}>{formatBytes(asset.fileSizeBytes)}</Text>
            <Text style={styles.dataMeta}>{asset.state.replace(/_/g, " ")}</Text>
            <AppButton
              label="Open file"
              onPress={() => {
                void Linking.openURL(asset.downloadUrl);
              }}
              variant="ghost"
              testID={testID ? `${testID}-open-${asset.id}` : undefined}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
