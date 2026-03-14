
import {
  AuthenticatedUser, completeMediaUpload, createMediaUploadTicket,
  formatDate, getMyProfile, listMyMedia, listPublicApprovedMedia, MediaAssetRecord, PublicMediaAssetRecord, ProfileRecord, updateMyProfile
} from "../api";

import {
  randomHex, formatBytes, buildProfileForm,
  parseServiceCategories, shouldForceSignOut, asError, ProfileFormState
} from "../utils";

import {} from "../constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { useAppTheme } from "../theme-context";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    hero: {
      borderRadius: 28,
      padding: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14
    },
    heroRow: {
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
      borderColor: colors.line
    },
    avatarText: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "800"
    },
    heroName: {
      color: colors.ink,
      fontSize: 28,
      lineHeight: 31,
      fontWeight: "800"
    },
    heroHandle: {
      color: colors.muted,
      fontSize: 14
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
      fontWeight: "700"
    }
  });
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
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);

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
      const assets = await listPublicApprovedMedia(normalizedOwnerId);
      setPublicMediaAssets(assets);
    } catch (requestError) {
      setPublicGalleryError(asError(requestError, "Unable to load public media"));
      setPublicMediaAssets([]);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [record, media] = await Promise.all([
        getMyProfile(accessToken),
        listMyMedia(accessToken)
      ]);
      setProfile(record);
      setForm(buildProfileForm(record));
      setMediaAssets(media);
      setPublicGalleryOwner(record.userId);
      await loadPublicGallery(record.userId);
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

  const onUploadDemoMedia = useCallback(async (): Promise<void> => {
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const contentType = "image/jpeg";
      const body = `IllamHelp service proof ${Date.now()}`;
      const ticket = await createMediaUploadTicket(
        {
          kind: "image",
          contentType,
          fileSizeBytes: body.length,
          checksumSha256: randomHex(64),
          originalFileName: `service-proof-${Date.now()}.jpg`
        },
        accessToken
      );

      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body
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

      setMediaAssets((previous) => [
        completed,
        ...previous.filter((item) => item.id !== completed.id)
      ]);
      setMediaSuccess("Upload received. Review started.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload media");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [accessToken, onSessionInvalid]);

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
      <View style={localStyles.hero}>
        <View style={localStyles.heroRow}>
          <View style={localStyles.avatar}>
            <Text style={localStyles.avatarText}>
              {(profile?.displayName ?? user.publicUserId).slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={localStyles.heroName}>{profile?.displayName ?? "IllamHelp member"}</Text>
            <Text style={localStyles.heroHandle}>@{profile?.userId ?? user.publicUserId}</Text>
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
      <SectionCard title="Professional media">
        <Text style={styles.cardBody}>
          Upload service-related photos/videos only. Each upload goes through AI and human review
          before public display.
        </Text>
        {mediaError ? <Banner tone="error" message={mediaError} testID="profile-media-error" /> : null}
        {mediaSuccess ? (
          <Banner tone="success" message={mediaSuccess} testID="profile-media-success" />
        ) : null}
        <AppButton
          label={mediaUploading ? "Uploading..." : "Upload sample proof"}
          onPress={() => {
            void onUploadDemoMedia();
          }}
          disabled={mediaUploading}
          testID="profile-media-upload"
        />
        {mediaAssets.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No media uploaded yet.</Text>
        ) : null}
        {mediaAssets.slice(0, 6).map((asset) => (
          <View key={asset.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>{asset.objectKey.split("/").slice(-1)[0]}</Text>
            <Text style={styles.dataMeta}>
              {asset.kind} · {asset.state.replace(/_/g, " ")}
            </Text>
            <Text style={styles.dataMeta}>{formatBytes(asset.fileSizeBytes)}</Text>
            <Text style={styles.dataMeta}>{formatDate(asset.createdAt)}</Text>
          </View>
        ))}
      </SectionCard>
      <SectionCard title="Public gallery preview">
        <Text style={styles.cardBody}>
          This view matches what other members can open publicly after moderation approval.
        </Text>
        {publicGalleryError ? (
          <Banner tone="error" message={publicGalleryError} testID="profile-public-media-error" />
        ) : null}
        <InputField
          label="Member ID"
          value={publicGalleryOwner}
          onChangeText={setPublicGalleryOwner}
          placeholder="anita_worker_01"
          testID="profile-public-owner-input"
        />
        <AppButton
          label={publicGalleryLoading ? "Loading..." : "Load approved media"}
          onPress={() => {
            void loadPublicGallery(publicGalleryOwner);
          }}
          disabled={publicGalleryLoading}
          testID="profile-public-load"
        />
        {publicMediaAssets.length === 0 ? (
          <Text style={styles.cardBodyMuted} testID="profile-public-empty">
            No approved media yet.
          </Text>
        ) : null}
        {publicMediaAssets.map((asset) => (
          <View key={asset.id} style={styles.dataRow} testID="profile-public-item">
            <Text style={styles.dataTitle}>
              {asset.kind} · {formatBytes(asset.fileSizeBytes)}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(asset.createdAt)}</Text>
            <AppButton
              label="Open approved file"
              onPress={() => {
                void Linking.openURL(asset.downloadUrl);
              }}
              variant="ghost"
              testID={`profile-public-open-${asset.id}`}
            />
          </View>
        ))}
      </SectionCard>
      {loading ? <Text style={styles.cardBodyMuted}>Loading profile...</Text> : null}
      <AppButton label="Sign out" onPress={onSignOut} variant="ghost" testID="profile-signout" />
    </ScrollView>
  );
}
