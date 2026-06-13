import { useState } from "react";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import type { PublicMediaAssetRecord } from "./api";
import { AppButton } from "./components";
import { formatBytes } from "./utils";
import { useAppStyles } from "./theme-context";

type ExpoVideoViewProps = {
  player: unknown;
  style: unknown;
  contentFit: "cover" | "contain";
  nativeControls?: boolean;
  allowsFullscreen?: boolean;
  accessibilityLabel?: string;
};

const ExpoVideoView = VideoView as unknown as (props: ExpoVideoViewProps) => JSX.Element;

function VideoSurface({
  uri,
  fit,
  muted,
  autoPlay,
  accessibilityLabel
}: {
  uri: string;
  fit: "cover" | "contain";
  muted: boolean;
  autoPlay: boolean;
  accessibilityLabel: string;
}): JSX.Element {
  const styles = useAppStyles();
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.muted = muted;
    if (autoPlay) {
      videoPlayer.play();
    }
  });

  return (
    <ExpoVideoView
      player={player}
      style={fit === "cover" ? styles.mediaPreviewVideo : styles.mediaViewerVideo}
      contentFit={fit}
      nativeControls
      allowsFullscreen
      accessibilityLabel={accessibilityLabel}
    />
  );
}

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeAsset = activeIndex === null ? null : items[activeIndex] ?? null;

  const onCarouselScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const slideWidth = 184;
    setCurrentIndex(Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.x / slideWidth))));
  };

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
        onMomentumScrollEnd={onCarouselScrollEnd}
      >
        {items.map((asset, index) => (
          <View
            key={asset.id}
            style={styles.mediaPreviewCard}
            testID={testID ? `${testID}-item` : undefined}
          >
            <View style={styles.mediaPreviewFrame}>
            {asset.kind === "image" ? (
              <Pressable
                style={({ pressed }) => [
                  styles.mediaPreviewImage,
                  pressed ? styles.mediaPreviewCardPressed : null
                ]}
                onPress={() => {
                  setCurrentIndex(index);
                  setActiveIndex(index);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Maximise approved ${purposeLabel(asset.purpose)} photo`}
              >
                <Image
                  source={{ uri: asset.downloadUrl }}
                  style={styles.mediaPreviewImage}
                  resizeMode="cover"
                  accessibilityLabel={`Approved ${purposeLabel(asset.purpose)} photo`}
                />
              </Pressable>
            ) : (
              <VideoSurface
                uri={asset.downloadUrl}
                fit="cover"
                muted
                autoPlay={false}
                accessibilityLabel={`Approved ${purposeLabel(asset.purpose)} video`}
              />
            )}
              <View style={styles.mediaKindPill}>
                <Text style={styles.mediaKindPillText}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
              </View>
              {asset.kind === "video" ? (
                <View style={styles.mediaPlayPill} pointerEvents="none">
                  <Text style={styles.mediaKindPillText}>Play</Text>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.mediaMaximisePill,
                  pressed ? styles.mediaPreviewCardPressed : null
                ]}
                onPress={() => {
                  setCurrentIndex(index);
                  setActiveIndex(index);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Maximise approved ${purposeLabel(asset.purpose)} ${asset.kind}`}
              >
                <Text style={styles.mediaMaximiseText}>Maximise</Text>
              </Pressable>
            </View>
            <View style={styles.mediaPreviewMeta}>
              <Text style={styles.dataTitle}>{asset.kind === "image" ? "Photo" : "Video"}</Text>
              <Text style={styles.dataMeta}>{formatBytes(asset.fileSizeBytes)} · {asset.state.replace(/_/g, " ")}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {items.length > 1 ? (
        <View style={styles.mediaCarouselDots} accessibilityLabel={`${items.length} media items`}>
          {items.map((asset, index) => (
            <View
              key={asset.id}
              style={[styles.mediaCarouselDot, index === currentIndex ? styles.mediaCarouselDotActive : null]}
              accessible
              accessibilityLabel={`Media ${index + 1} of ${items.length}${index === currentIndex ? ", current" : ""}`}
            />
          ))}
        </View>
      ) : null}
      <Modal
        visible={!!activeAsset}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveIndex(null)}
      >
        <View style={styles.mediaViewerBackdrop}>
          <View
            style={styles.mediaViewerPanel}
            accessible
            accessibilityViewIsModal
            accessibilityLabel={activeAsset ? `${activeAsset.kind === "image" ? "Photo" : "Video"} viewer` : "Media viewer"}
          >
            {activeAsset ? (
              <>
                <View style={styles.notificationMetaRow}>
                  <View>
                    <Text style={styles.dataTitle}>{activeAsset.kind === "image" ? "Photo" : "Video"}</Text>
                    <Text style={styles.dataMeta}>{formatBytes(activeAsset.fileSizeBytes)}</Text>
                  </View>
                  <AppButton label="Close" onPress={() => setActiveIndex(null)} variant="ghost" />
                </View>
                {activeAsset.kind === "image" ? (
                  <Image
                    source={{ uri: activeAsset.downloadUrl }}
                    style={styles.mediaViewerImage}
                    resizeMode="contain"
                    accessibilityLabel={`Approved ${purposeLabel(activeAsset.purpose)} photo`}
                  />
                ) : (
                  <VideoSurface
                    uri={activeAsset.downloadUrl}
                    fit="contain"
                    muted={false}
                    autoPlay
                    accessibilityLabel={`Approved ${purposeLabel(activeAsset.purpose)} video`}
                  />
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
