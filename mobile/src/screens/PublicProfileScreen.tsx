import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AuthenticatedUser,
  getProfileByUserId,
  listPublicApprovedMediaPage,
  ProfileRecord,
  PublicMediaAssetRecord,
  requestConnection
} from "../api";
import { approvedMedia } from "../MediaUploadPanel";
import { MediaPreviewList } from "../MediaPreviewList";
import { AppButton, Banner, SectionCard } from "../components";
import { styles } from "../styles";
import { useAppTheme } from "../theme-context";
import { asError, shouldForceSignOut } from "../utils";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    hero: {
      borderRadius: 12,
      padding: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14
    },
    identityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden"
    },
    avatarImage: {
      width: "100%",
      height: "100%"
    },
    avatarText: {
      color: colors.brandText,
      fontSize: 32,
      fontWeight: "800",
      lineHeight: 38
    },
    name: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "700",
      lineHeight: 31
    },
    meta: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    detailList: {
      gap: 8
    }
  });
}

function profileLocation(profile: ProfileRecord): string {
  return [profile.city, profile.area].filter(Boolean).join(", ") || "Location not shared";
}

export function PublicProfileScreen({
  accessToken,
  user,
  targetUserId,
  onBack,
  onSessionInvalid
}: {
  accessToken: string;
  user: AuthenticatedUser;
  targetUserId: string;
  onBack: () => void;
  onSessionInvalid: () => void;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [mediaAssets, setMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);

  const profileMedia = useMemo(
    () => approvedMedia(mediaAssets.filter((asset) => asset.purpose === "profile")),
    [mediaAssets]
  );
  const profilePicture = profileMedia.find((asset) => asset.kind === "image") ?? null;
  const isOwnProfile = user.publicUserId === targetUserId;

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [profileRecord, mediaPage] = await Promise.all([
        getProfileByUserId(targetUserId, accessToken),
        listPublicApprovedMediaPage(targetUserId, accessToken).catch(() => ({ items: [], nextCursor: null }))
      ]);
      setProfile(profileRecord);
      setMediaAssets(mediaPage.items);
      setMediaCursor(mediaPage.nextCursor);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load this profile");
      setError(message);
      setProfile(null);
      setMediaAssets([]);
      setMediaCursor(null);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid, targetUserId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadMoreMedia = async (): Promise<void> => {
    if (!mediaCursor) return;
    const page = await listPublicApprovedMediaPage(targetUserId, accessToken, mediaCursor);
    setMediaAssets((previous) => [...previous, ...page.items]);
    setMediaCursor(page.nextCursor);
  };

  const onRequestConnection = async (): Promise<void> => {
    setRequestLoading(true);
    setRequestMessage(null);
    setError(null);
    try {
      await requestConnection({ targetUserId }, accessToken);
      setRequestMessage("Connection request sent.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to send connection request");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="public-profile-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Profile</Text>
        <Text style={styles.screenTitle}>{profile?.displayName ?? "Member profile"}</Text>
        <Text style={styles.screenSubtitle}>Only privacy-allowed details and approved profile media are shown.</Text>
      </View>
      <AppButton label="Back to people" onPress={onBack} variant="ghost" testID="public-profile-back" />
      {error ? <Banner tone="error" message={error} testID="public-profile-error" /> : null}
      {requestMessage ? <Banner tone="success" message={requestMessage} testID="public-profile-success" /> : null}
      {loading ? <Text style={styles.cardBodyMuted}>Loading profile...</Text> : null}
      {profile ? (
        <>
          <View style={localStyles.hero}>
            <Text style={styles.pill}>Human identity</Text>
            <View style={localStyles.identityRow}>
              <View style={localStyles.avatar}>
                {profilePicture ? (
                  <Image source={{ uri: profilePicture.downloadUrl }} style={localStyles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={localStyles.avatarText}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={localStyles.name}>{profile.displayName}</Text>
                <Text style={localStyles.meta}>Member ID: {profile.userId}</Text>
                <Text style={localStyles.meta}>{profileLocation(profile)}</Text>
                <Text style={localStyles.meta}>
                  {profile.serviceCategories.slice(0, 2).join(", ") || "Services not shared"}
                </Text>
              </View>
            </View>
          </View>

          <SectionCard title="Privacy state">
            <Text style={styles.cardBodyMuted}>
              {profileMedia.length} approved profile media visible to you. Verification documents are never shown here.
            </Text>
            <MediaPreviewList
              items={profileMedia}
              emptyText="No approved profile photos or videos are visible to you."
              testID="public-profile-media"
            />
            {mediaCursor ? (
              <AppButton
                label="Load more media"
                onPress={() => {
                  void loadMoreMedia();
                }}
                variant="secondary"
                testID="public-profile-media-load-more"
              />
            ) : null}
          </SectionCard>

          <SectionCard title="Shared details">
            <View style={localStyles.detailList}>
              <Text style={styles.dataMeta}>Email: {profile.contact.email ?? profile.contact.emailMasked ?? "Not shared"}</Text>
              <Text style={styles.dataMeta}>Phone: {profile.contact.phone ?? profile.contact.phoneMasked ?? "Not shared"}</Text>
              <Text style={styles.dataMeta}>Address: {profile.contact.fullAddress ?? "Not shared"}</Text>
              <Text style={styles.dataMeta}>
                Rating: {profile.ratingAverage ? `${profile.ratingAverage.toFixed(1)} (${profile.ratingCount})` : "No rating yet"}
              </Text>
            </View>
          </SectionCard>

          <SectionCard title="Next safe action">
            <Text style={styles.cardBodyMuted}>
              {isOwnProfile ? "This is your own profile." : "Send a connection request before asking for private contact details."}
            </Text>
            {!isOwnProfile ? (
              <AppButton
                label={requestLoading ? "Sending request..." : "Send connection request"}
                onPress={() => {
                  void onRequestConnection();
                }}
                loading={requestLoading}
                disabled={requestLoading}
                testID="public-profile-request"
              />
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );
}
