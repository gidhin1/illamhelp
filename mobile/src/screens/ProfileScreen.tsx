
import {
  AuthenticatedUser, completeMediaUpload, createMediaUploadTicket,
  getMyProfile, listMyMediaPage, listPublicApprovedMediaPage, MediaAssetRecord, MediaKind, PublicMediaAssetRecord, ProfileRecord, updateMyProfile
} from "../api";

import {
  randomHex, buildProfileForm,
  parseServiceCategories, shouldForceSignOut, asError, ProfileFormState
} from "../utils";

import {} from "../constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { MediaPreviewList } from "../MediaPreviewList";
import {
  approvedMedia,
  MediaUploadPanel,
  pendingReviewMedia,
  PickedMediaFile
} from "../MediaUploadPanel";
import { useAppTheme } from "../theme-context";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    header: {
      borderRadius: 12,
      padding: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14
    },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
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
    avatarBadge: {
      position: "absolute",
      right: 4,
      bottom: 4,
      borderRadius: 999,
      backgroundColor: colors.ink,
      paddingHorizontal: 7,
      paddingVertical: 3
    },
    avatarBadgeText: {
      color: colors.onStrong,
      fontSize: 10,
      fontWeight: "800",
      lineHeight: 13
    },
    avatarText: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "700",
      lineHeight: 31
    },
    headerName: {
      color: colors.ink,
      fontSize: 28,
      lineHeight: 31,
      fontWeight: "700"
    },
    headerHandle: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    metaChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    metaChipLabel: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16
    }
  });
}

function inferMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

function resolveUploadMedia(file: PickedMediaFile): { kind: MediaKind; contentType: string } | null {
  const normalizedType = file.mimeType.trim().toLowerCase();
  const kindFromType = inferMediaKind(normalizedType);
  if (kindFromType) {
    return { kind: kindFromType, contentType: normalizedType };
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(extension)) {
    return { kind: "image", contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}` };
  }
  if (extension && ["mp4", "mov", "m4v", "webm"].includes(extension)) {
    return { kind: "video", contentType: extension === "mov" ? "video/quicktime" : `video/${extension}` };
  }
  return null;
}

export function ProfileScreen({
  accessToken,
  user,
  onSessionInvalid,
  onSignOut
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
  onSignOut: () => void;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);
  const [pickedProfileMediaFiles, setPickedProfileMediaFiles] = useState<PickedMediaFile[]>([]);
  const [pickedProfilePictureFile, setPickedProfilePictureFile] = useState<PickedMediaFile | null>(null);
  const [profilePictureUploading, setProfilePictureUploading] = useState(false);
  const [profilePictureError, setProfilePictureError] = useState<string | null>(null);
  const [profilePictureSuccess, setProfilePictureSuccess] = useState<string | null>(null);
  const [pendingProfilePicture, setPendingProfilePicture] = useState<MediaAssetRecord | null>(null);
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicMediaCursor, setPublicMediaCursor] = useState<string | null>(null);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);
  const profileApprovedMedia = useMemo(
    () => approvedMedia(publicMediaAssets.filter((asset) => asset.purpose === "profile")),
    [publicMediaAssets]
  );
  const currentProfilePicture = useMemo(
    () => profileApprovedMedia.find((asset) => asset.kind === "image") ?? null,
    [profileApprovedMedia]
  );

  const loadPublicGallery = useCallback(async (ownerUserId: string): Promise<void> => {
    const normalizedOwnerId = ownerUserId.trim().toLowerCase();
    if (!normalizedOwnerId) {
      setPublicGalleryError("Enter a member ID to load approved media.");
      setPublicMediaAssets([]);
      return;
    }

    setPublicGalleryLoading(true);
    setPublicGalleryError(null);
    try {
      const page = await listPublicApprovedMediaPage(normalizedOwnerId, accessToken);
      setPublicMediaAssets(page.items);
      setPublicMediaCursor(page.nextCursor);
    } catch (requestError) {
      setPublicGalleryError(asError(requestError, "Unable to load public media"));
      setPublicMediaAssets([]);
      setPublicMediaCursor(null);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, [accessToken]);

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const record = await getMyProfile(accessToken);
      setProfile(record);
      setForm(buildProfileForm(record));
      setPublicGalleryOwner(record.userId);
      const [mediaPage, publicMediaPage] = await Promise.all([
        listMyMediaPage(accessToken).catch(() => ({ items: [], nextCursor: null })),
        listPublicApprovedMediaPage(record.userId, accessToken).catch(() => ({ items: [], nextCursor: null }))
      ]);
      setMediaAssets(mediaPage.items);
      setMediaCursor(mediaPage.nextCursor);
      setPublicMediaAssets(publicMediaPage.items);
      setPublicMediaCursor(publicMediaPage.nextCursor);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load profile");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadPublicGallery, onSessionInvalid]);

  const loadMoreMedia = async (): Promise<void> => {
    if (!mediaCursor) return;
    const page = await listMyMediaPage(accessToken, mediaCursor);
    setMediaAssets((previous) => [...previous, ...page.items]);
    setMediaCursor(page.nextCursor);
  };

  const loadMorePublicMedia = async (): Promise<void> => {
    if (!publicMediaCursor) return;
    const page = await listPublicApprovedMediaPage(publicGalleryOwner.trim().toLowerCase(), accessToken, publicMediaCursor);
    setPublicMediaAssets((previous) => [...previous, ...page.items]);
    setPublicMediaCursor(page.nextCursor);
  };

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSaveProfile = useCallback(async (): Promise<void> => {
    if (!form) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateMyProfile(
        {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || undefined,
          city: form.city.trim() || undefined,
          area: form.area.trim() || undefined,
          serviceCategories: parseServiceCategories(form.serviceCategories),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          alternatePhone: form.alternatePhone.trim() || undefined,
          fullAddress: form.fullAddress.trim() || undefined
        },
        accessToken
      );
      setProfile(updated);
      setForm(buildProfileForm(updated));
      setSuccess("Profile updated.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to update profile");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSaving(false);
    }
  }, [accessToken, form, onSessionInvalid]);

  const onPickProfileMedia = useCallback(async (): Promise<void> => {
    setMediaError(null);
    setMediaSuccess(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: true,
      copyToCacheDirectory: true
    });
    if (result.canceled) {
      return;
    }
    const files: PickedMediaFile[] = [];
    for (const asset of result.assets) {
      if (!asset?.mimeType || !asset.size) {
        setMediaError("Choose images or videos with readable file sizes.");
        return;
      }
      if (!resolveUploadMedia({
        uri: asset.uri,
        name: asset.name || `profile-media-${Date.now()}`,
        mimeType: asset.mimeType,
        size: asset.size
      })) {
        setMediaError("Only profile photos and videos are supported.");
        return;
      }
      files.push({
        uri: asset.uri,
        name: asset.name || `profile-media-${Date.now()}`,
        mimeType: asset.mimeType,
        size: asset.size
      });
    }
    setPickedProfileMediaFiles((previous) => [...previous, ...files]);
  }, []);

  const onCaptureProfileMedia = useCallback(async (): Promise<void> => {
    setMediaError(null);
    setMediaSuccess(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMediaError("Allow camera access to take profile photos or videos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: 60
    });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
    const size = asset.fileSize ?? 0;
    if (!size) {
      setMediaError("Choose an image or video with a readable file size.");
      return;
    }
    if (!resolveUploadMedia({
      uri: asset.uri,
      name: asset.fileName || `profile-media-${Date.now()}`,
      mimeType,
      size
    })) {
      setMediaError("Only profile photos and videos are supported.");
      return;
    }
    setPickedProfileMediaFiles((previous) => [...previous, {
      uri: asset.uri,
      name: asset.fileName || `profile-media-${Date.now()}`,
      mimeType,
      size
    }]);
  }, []);

  const uploadProfileFiles = useCallback(async (files: PickedMediaFile[]): Promise<MediaAssetRecord[]> => {
    const invalidFile = files.find((file) => !resolveUploadMedia(file));
    if (invalidFile) {
      throw new Error(`Only profile photos and videos are supported. Remove ${invalidFile.name}.`);
    }
    const completedUploads: MediaAssetRecord[] = [];
    for (const file of files) {
      const resolvedMedia = resolveUploadMedia(file);
      if (!resolvedMedia) continue;
      const ticket = await createMediaUploadTicket(
        {
          kind: resolvedMedia.kind,
          purpose: "profile",
          contentType: resolvedMedia.contentType,
          fileSizeBytes: file.size,
          checksumSha256: randomHex(64),
          originalFileName: file.name
        },
        accessToken
      );

      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body: {
          uri: file.uri,
          name: file.name,
          type: resolvedMedia.contentType
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
      completedUploads.push(completed);
    }
    return completedUploads;
  }, [accessToken]);

  const onUploadProfileMedia = useCallback(async (): Promise<void> => {
    if (pickedProfileMediaFiles.length === 0) {
      setMediaError("Choose one or more profile photos or videos first.");
      return;
    }
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const completedUploads = await uploadProfileFiles(pickedProfileMediaFiles);
      setMediaAssets((previous) => [
        ...completedUploads,
        ...previous.filter((item) => !completedUploads.some((completed) => completed.id === item.id))
      ]);
      setPickedProfileMediaFiles([]);
      setMediaSuccess(`${completedUploads.length} profile ${completedUploads.length === 1 ? "file" : "files"} uploaded for review.`);
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload media");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [onSessionInvalid, pickedProfileMediaFiles, uploadProfileFiles]);

  const setProfilePictureFromAsset = useCallback((asset: ImagePicker.ImagePickerAsset): void => {
    const mimeType = asset.mimeType ?? "image/jpeg";
    const size = asset.fileSize ?? 0;
    const fileName = asset.fileName || `profile-picture-${Date.now()}.jpg`;
    const file: PickedMediaFile = {
      uri: asset.uri,
      name: fileName,
      mimeType,
      size
    };
    if (!size) {
      setProfilePictureError("Choose an image with a readable file size.");
      return;
    }
    if (resolveUploadMedia(file)?.kind !== "image") {
      setProfilePictureError("Choose an image file for your profile picture.");
      return;
    }
    setPickedProfilePictureFile(file);
    setProfilePictureError(null);
    setProfilePictureSuccess(null);
  }, []);

  const onPickProfilePicture = useCallback(async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1]
    });
    if (result.canceled) return;
    setProfilePictureFromAsset(result.assets[0]);
  }, [setProfilePictureFromAsset]);

  const onCaptureProfilePicture = useCallback(async (): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setProfilePictureError("Allow camera access to take a profile picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1]
    });
    if (result.canceled) return;
    setProfilePictureFromAsset(result.assets[0]);
  }, [setProfilePictureFromAsset]);

  const onUploadProfilePicture = useCallback(async (): Promise<void> => {
    if (!pickedProfilePictureFile) {
      setProfilePictureError("Choose a profile picture first.");
      return;
    }
    setProfilePictureUploading(true);
    setProfilePictureError(null);
    setProfilePictureSuccess(null);
    try {
      const completedUploads = await uploadProfileFiles([pickedProfilePictureFile]);
      const completedPicture = completedUploads.find((asset) => asset.kind === "image") ?? null;
      setMediaAssets((previous) => [
        ...completedUploads,
        ...previous.filter((item) => !completedUploads.some((completed) => completed.id === item.id))
      ]);
      setPendingProfilePicture(completedPicture);
      setPickedProfilePictureFile(null);
      setProfilePictureSuccess("Profile picture uploaded for review.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload profile picture");
      setProfilePictureError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setProfilePictureUploading(false);
    }
  }, [onSessionInvalid, pickedProfilePictureFile, uploadProfileFiles]);

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="profile-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Profile</Text>
        <Text style={styles.screenTitle}>Your account</Text>
        <Text style={styles.screenSubtitle}>Manage your details and sharing preferences.</Text>
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      {success ? <Banner tone="success" message={success} /> : null}
      <View style={localStyles.header}>
	        <View style={localStyles.headerRow}>
	          <View style={localStyles.avatar}>
	            {pickedProfilePictureFile ? (
	              <Image source={{ uri: pickedProfilePictureFile.uri }} style={localStyles.avatarImage} resizeMode="cover" />
	            ) : currentProfilePicture ? (
	              <Image source={{ uri: currentProfilePicture.downloadUrl }} style={localStyles.avatarImage} resizeMode="cover" />
	            ) : (
	              <Text style={localStyles.avatarText}>
	                {(profile?.displayName ?? user.publicUserId).slice(0, 1).toUpperCase()}
	              </Text>
	            )}
	            {pickedProfilePictureFile || pendingProfilePicture ? (
	              <View style={localStyles.avatarBadge}>
	                <Text style={localStyles.avatarBadgeText}>
	                  {profilePictureUploading ? "Uploading" : "Review"}
	                </Text>
	              </View>
	            ) : null}
	          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={localStyles.headerName}>{profile?.displayName ?? "IllamHelp member"}</Text>
            <Text style={localStyles.headerHandle}>@{profile?.userId ?? user.publicUserId}</Text>
          </View>
        </View>
        <View style={localStyles.metaRow}>
          {profile?.city ? (
            <View style={localStyles.metaChip}>
              <Text style={localStyles.metaChipLabel}>{profile.city}</Text>
            </View>
          ) : null}
          {profile?.area ? (
            <View style={localStyles.metaChip}>
              <Text style={localStyles.metaChipLabel}>{profile.area}</Text>
            </View>
          ) : null}
          {profile?.serviceCategories?.slice(0, 2).map((service) => (
            <View key={service} style={localStyles.metaChip}>
              <Text style={localStyles.metaChipLabel}>{service}</Text>
            </View>
          ))}
          <View style={localStyles.metaChip}>
            <Text style={localStyles.metaChipLabel}>{mediaAssets.length} media item(s)</Text>
          </View>
        </View>
      </View>
      <SectionCard title="Identity">
        <Text style={styles.dataMeta} testID="profile-user-id">
          Member ID: {profile?.userId ?? user.publicUserId}
        </Text>
        <Text style={styles.dataMeta}>Name: {profile?.displayName ?? "-"}</Text>
        <Text style={styles.dataMeta}>Account: Member</Text>
      </SectionCard>
      {form ? (
        <SectionCard title="Edit profile">
          <InputField
            label="First name"
            value={form.firstName}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, firstName: value } : previous))}
            testID="profile-first-name"
          />
          <InputField
            label="Last name"
            value={form.lastName}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, lastName: value } : previous))}
            testID="profile-last-name"
          />
          <InputField
            label="City"
            value={form.city}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, city: value } : previous))}
            testID="profile-city"
          />
          <InputField
            label="Area"
            value={form.area}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, area: value } : previous))}
            testID="profile-area"
          />
          <InputField
            label="Services offered (comma separated)"
            value={form.serviceCategories}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, serviceCategories: value } : previous))}
            placeholder="maid, plumber, electrician"
            testID="profile-service-categories"
          />
          <InputField
            label="Email"
            value={form.email}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, email: value } : previous))}
            placeholder={profile?.contact.emailMasked ?? "email@example.com"}
            autoComplete="email"
            textContentType="emailAddress"
            testID="profile-email"
          />
          <InputField
            label="Phone"
            value={form.phone}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, phone: value } : previous))}
            placeholder={profile?.contact.phoneMasked ?? "+919876543210"}
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="profile-phone"
          />
          <InputField
            label="Alternate phone"
            value={form.alternatePhone}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, alternatePhone: value } : previous))}
            placeholder="+919812345678"
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="profile-alternate-phone"
          />
          <InputField
            label="Address"
            value={form.fullAddress}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, fullAddress: value } : previous))}
            placeholder="Flat 10B, Green Meadows, Kakkanad, Kochi"
            multiline
            testID="profile-full-address"
          />
          <AppButton
            label={saving ? "Saving..." : "Save profile"}
            onPress={() => {
              void onSaveProfile();
            }}
            disabled={saving}
            testID="profile-save"
          />
        </SectionCard>
      ) : null}
      <SectionCard title="Privacy and media safety">
        <Text style={styles.cardBody}>
          Your contact details stay private until you approve sharing.
        </Text>
        <Text style={styles.cardBodyMuted}>
          You can stop sharing at any time from the Privacy tab.
        </Text>
      </SectionCard>
      <SectionCard title="Profile picture">
        <Text style={styles.cardBodyMuted}>
          Profile pictures use profile media review and appear only where profile media is allowed.
        </Text>
        {profilePictureError ? <Banner tone="error" message={profilePictureError} testID="profile-picture-error" /> : null}
        {profilePictureSuccess ? <Banner tone="success" message={profilePictureSuccess} testID="profile-picture-success" /> : null}
        {pickedProfilePictureFile ? (
          <Text style={styles.dataMeta} testID="profile-picture-selected">
            Selected: {pickedProfilePictureFile.name}
          </Text>
        ) : null}
        <View style={styles.mediaPickerActions}>
          <AppButton
            label="Take picture"
            onPress={() => {
              void onCaptureProfilePicture();
            }}
            variant="secondary"
            disabled={profilePictureUploading}
            testID="profile-picture-camera"
          />
          <AppButton
            label="Choose picture"
            onPress={() => {
              void onPickProfilePicture();
            }}
            variant="secondary"
            disabled={profilePictureUploading}
            testID="profile-picture-pick"
          />
        </View>
        <AppButton
          label={profilePictureUploading ? "Uploading picture..." : "Upload picture"}
          onPress={() => {
            void onUploadProfilePicture();
          }}
          loading={profilePictureUploading}
          disabled={profilePictureUploading || !pickedProfilePictureFile}
          testID="profile-picture-upload"
        />
      </SectionCard>
      <SectionCard title="Professional media">
        <MediaUploadPanel
          title="Profile photos and videos"
          description="Show work examples and service proof. Approved media is visible to accepted connections."
          pickLabel="Add profile media"
          cameraLabel="Take profile media"
          uploadLabel="Upload profile media"
          pickedFiles={pickedProfileMediaFiles}
          pendingItems={pendingReviewMedia(mediaAssets.filter((asset) => asset.purpose === "profile"))}
          uploading={mediaUploading}
          error={mediaError}
          success={mediaSuccess}
          testID="profile-media-upload"
          onPick={() => {
            void onPickProfileMedia();
          }}
          onCameraPick={() => {
            void onCaptureProfileMedia();
          }}
          onClear={() => setPickedProfileMediaFiles([])}
          onRemove={(index) => setPickedProfileMediaFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
          onUpload={() => {
            void onUploadProfileMedia();
          }}
        />
        {mediaAssets.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No media uploaded yet.</Text>
        ) : null}
        {mediaCursor ? (
          <AppButton
            label="Load more media"
            onPress={() => {
              void loadMoreMedia();
            }}
            variant="secondary"
            testID="profile-media-load-more"
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Public gallery preview">
        <Text style={styles.cardBody}>
          This view matches what other members can open publicly after moderation approval.
        </Text>
        {publicGalleryError ? (
          <Banner tone="error" message={publicGalleryError} testID="profile-public-media-error" />
        ) : null}
        <InputField
          label="Member to preview"
          value={publicGalleryOwner}
          onChangeText={setPublicGalleryOwner}
          placeholder="anita_worker_01"
          testID="profile-public-owner-input"
        />
        <AppButton
          label={publicGalleryLoading ? "Loading media" : "Load approved media"}
          onPress={() => {
            void loadPublicGallery(publicGalleryOwner);
          }}
          disabled={publicGalleryLoading}
          testID="profile-public-load"
        />
	        <MediaPreviewList
	          items={profileApprovedMedia}
          emptyText="No approved profile media yet."
          testID="profile-public"
        />
        {publicMediaCursor ? (
          <AppButton
            label="Load more approved media"
            onPress={() => {
              void loadMorePublicMedia();
            }}
            variant="secondary"
            testID="profile-public-load-more"
          />
        ) : null}
      </SectionCard>
      {loading ? <Text style={styles.cardBodyMuted}>Loading profile...</Text> : null}
      <AppButton label="Sign out" onPress={onSignOut} variant="ghost" testID="profile-signout" />
    </ScrollView>
  );
}
