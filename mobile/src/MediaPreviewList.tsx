import { useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";

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
  const [activeAsset, setActiveAsset] = useState<PublicMediaAssetRecord | null>(null);

  if (items.length === 0) {
    return (
      <Text style={styles.cardBodyMuted} testID={testID ? `${testID}-empty` : undefined}>
        {emptyText}
      </Text>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mediaCarouselRail}
        testID={testID}
        snapToInterval={184}
        decelerationRate="fast"
      >
        {items.map((asset) => (
          <Pressable
            key={asset.id}
            style={({ pressed }) => [
              styles.mediaPreviewCard,
              pressed ? styles.mediaPreviewCardPressed : null
            ]}
            testID={testID ? `${testID}-item` : undefined}
            onPress={() => setActiveAsset(asset)}
            accessibilityRole="button"
            accessibilityLabel={`Open approved ${purposeLabel(asset.purpose)} ${asset.kind}`}
          >
            <View style={styles.mediaPreviewFrame}>
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
                <Text style={styles.mediaPreviewVideoLabel}>Play video</Text>
              </View>
            )}
              <View style={styles.mediaKindPill}>
                <Text style={styles.mediaKindPillText}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
              </View>
            </View>
            <View style={styles.mediaPreviewMeta}>
              <Text style={styles.dataTitle}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
              <Text style={styles.dataMeta}>{formatBytes(asset.fileSizeBytes)} · {asset.state.replace(/_/g, " ")}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={!!activeAsset}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveAsset(null)}
      >
        <View style={styles.mediaViewerBackdrop}>
          <View style={styles.mediaViewerPanel}>
            {activeAsset ? (
              <>
                <View style={styles.notificationMetaRow}>
                  <View>
                    <Text style={styles.dataTitle}>{activeAsset.kind === "image" ? "Photo" : "Video"}</Text>
                    <Text style={styles.dataMeta}>{formatBytes(activeAsset.fileSizeBytes)}</Text>
                  </View>
                  <AppButton label="Close" onPress={() => setActiveAsset(null)} variant="ghost" />
                </View>
                {activeAsset.kind === "image" ? (
                  <Image
                    source={{ uri: activeAsset.downloadUrl }}
                    style={styles.mediaViewerImage}
                    resizeMode="contain"
                    accessibilityLabel={`Approved ${purposeLabel(activeAsset.purpose)} photo`}
                  />
                ) : (
                  <View style={styles.mediaViewerVideo}>
                    <Text style={styles.mediaPreviewVideoLabel}>Video preview</Text>
                    <AppButton
                      label="Open video player"
                      onPress={() => {
                        void Linking.openURL(activeAsset.downloadUrl);
                      }}
                      variant="secondary"
                    />
                  </View>
                )}
                <AppButton
                  label="Open original file"
                  onPress={() => {
                    void Linking.openURL(activeAsset.downloadUrl);
                  }}
                  variant="secondary"
                  testID={testID ? `${testID}-open-${activeAsset.id}` : undefined}
                />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
