import {
  AuthenticatedUser,
  deleteOwnedMedia,
  formatDate,
  getMyProfile,
  getServiceCatalog,
  listMyMedia,
  listPublicApprovedMedia,
  MediaAssetRecord,
  PublicMediaAssetRecord,
  ProfileRecord,
  removeMyAvatar,
  ServiceCatalogOption,
  ServiceSkill,
  updateMyProfile
} from "../api";

import { formatBytes, shouldForceSignOut, asError } from "../utils";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard } from "../components";
import { useAppTheme } from "../theme-context";
import { FALLBACK_SERVICE_CATALOG, PROFICIENCY_OPTIONS } from "../service-catalog";
import { MemberAvatar } from "../member-avatar";
import { pickSingleImage, uploadPickedImage, type PickedImageAsset } from "../media-upload";

interface ProfileFormState {
  firstName: string;
  lastName: string;
  city: string;
  area: string;
  email: string;
  phone: string;
  alternatePhone: string;
  fullAddress: string;
  serviceSkills: ServiceSkill[];
}

function buildProfileForm(profile: ProfileRecord): ProfileFormState {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName ?? "",
    city: profile.city ?? "",
    area: profile.area ?? "",
    email: profile.contact.email ?? "",
    phone: profile.contact.phone ?? "",
    alternatePhone: profile.contact.alternatePhone ?? "",
    fullAddress: profile.contact.fullAddress ?? "",
    serviceSkills: profile.serviceSkills
  };
}

function uniqueSkills(skills: ServiceSkill[]): ServiceSkill[] {
  const seen = new Map<string, ServiceSkill>();
  for (const skill of skills) {
    seen.set(skill.jobName.trim().toLowerCase(), skill);
  }
  return [...seen.values()];
}

function skillTestId(jobName: string): string {
  return jobName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function resolveServiceCatalog(options: ServiceCatalogOption[] | undefined): ServiceCatalogOption[] {
  if (!options?.length) {
    return FALLBACK_SERVICE_CATALOG;
  }
  const hasOther = options.some((option) => option.value === "other");
  if (!hasOther || options.length < FALLBACK_SERVICE_CATALOG.length) {
    return FALLBACK_SERVICE_CATALOG;
  }
  return options;
}

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: 28,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface
    },
    heroBanner: {
      minHeight: 128,
      backgroundColor: colors.brandAlt
    },
    heroBannerGlow: {
      position: "absolute",
      top: -40,
      right: -24,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: "rgba(255,255,255,0.22)"
    },
    heroBody: {
      paddingHorizontal: 18,
      paddingBottom: 18,
      gap: 14
    },
    heroTopRow: {
      marginTop: -48,
      flexDirection: "row",
      gap: 14,
      alignItems: "flex-end"
    },
    heroIdentity: {
      flex: 1,
      gap: 4
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
    heroHeadline: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    heroMetaRow: {
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
    },
    splitRow: {
      flexDirection: "row",
      gap: 10
    },
    infoTile: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    skillCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 10
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
  const [catalog, setCatalog] = useState<ServiceCatalogOption[]>(FALLBACK_SERVICE_CATALOG);
  const [selectedServiceValue, setSelectedServiceValue] = useState(
    FALLBACK_SERVICE_CATALOG[0]?.value ?? "plumbing"
  );
  const [selectedProficiency, setSelectedProficiency] = useState<
    (typeof PROFICIENCY_OPTIONS)[number]
  >("intermediate");
  const [customSkillName, setCustomSkillName] = useState("");
  const [galleryAsset, setGalleryAsset] = useState<PickedImageAsset | null>(null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [skillPickerVisible, setSkillPickerVisible] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
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

  const serviceCatalogByValue = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.value, item])),
    [catalog]
  );
  const avatarCandidates = useMemo(
    () => mediaAssets.filter((item) => item.context === "profile_avatar"),
    [mediaAssets]
  );
  const galleryItems = useMemo(
    () => mediaAssets.filter((item) => item.context !== "profile_avatar"),
    [mediaAssets]
  );
  const displayAvatar = profile?.activeAvatar ?? profile?.pendingAvatar ?? null;
  const hasDisplayedPhoto = Boolean(displayAvatar?.downloadUrl);
  const filteredCatalog = useMemo(() => {
    const query = skillSearch.trim().toLowerCase();
    if (!query) {
      return catalog;
    }
    return catalog.filter(
      (option) =>
        option.label.toLowerCase().includes(query) || option.group.toLowerCase().includes(query)
    );
  }, [catalog, skillSearch]);
  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, ServiceCatalogOption[]>();
    for (const option of filteredCatalog) {
      const current = groups.get(option.group) ?? [];
      current.push(option);
      groups.set(option.group, current);
    }
    return [...groups.entries()];
  }, [filteredCatalog]);
  const selectedServiceOption = serviceCatalogByValue[selectedServiceValue] ?? null;

  const heroLocation = useMemo(
    () => [form?.area?.trim(), form?.city?.trim()].filter(Boolean).join(", "),
    [form?.area, form?.city]
  );

  const heroHeadline = useMemo(() => {
    if (!form?.serviceSkills.length) {
      return "Add your strongest services so people know what to trust you with.";
    }
    return form.serviceSkills
      .slice(0, 3)
      .map((skill) => `${skill.jobName} (${skill.proficiency})`)
      .join(" · ");
  }, [form?.serviceSkills]);

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
      const [record, media, catalogResponse] = await Promise.all([
        getMyProfile(accessToken),
        listMyMedia(accessToken),
        getServiceCatalog().catch(() => ({
          options: FALLBACK_SERVICE_CATALOG,
          proficiencies: PROFICIENCY_OPTIONS
        }))
      ]);
      setProfile(record);
      setForm(buildProfileForm(record));
      setMediaAssets(media);
      setPublicGalleryOwner(record.userId);
      setCatalog(resolveServiceCatalog(catalogResponse.options));
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

  const onAddSkill = useCallback((): void => {
    if (!form) return;
    const selected = serviceCatalogByValue[selectedServiceValue];
    const isCustom = !selected || selected.value === "other";
    const jobName = (isCustom ? customSkillName : selected.label).trim();
    if (!jobName) {
      return;
    }
    setForm((previous) =>
      previous
        ? {
            ...previous,
            serviceSkills: uniqueSkills([
              ...previous.serviceSkills,
              {
                jobName,
                proficiency: selectedProficiency,
                source: isCustom ? "custom" : "catalog"
              }
            ])
          }
        : previous
    );
    setCustomSkillName("");
    setSkillSearch("");
    setSkillPickerVisible(false);
  }, [customSkillName, form, selectedProficiency, selectedServiceValue, serviceCatalogByValue]);

  const onRemoveSkill = useCallback((jobName: string): void => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            serviceSkills: previous.serviceSkills.filter((skill) => skill.jobName !== jobName)
          }
        : previous
    );
  }, []);

  const onChangeSkillProficiency = useCallback(
    (jobName: string, proficiency: (typeof PROFICIENCY_OPTIONS)[number]): void => {
      setForm((previous) =>
        previous
          ? {
              ...previous,
              serviceSkills: previous.serviceSkills.map((skill) =>
                skill.jobName === jobName ? { ...skill, proficiency } : skill
              )
            }
          : previous
      );
    },
    []
  );

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
          serviceSkills: form.serviceSkills,
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

  const uploadAvatarAsset = useCallback(async (asset: PickedImageAsset): Promise<void> => {
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const uploaded = await uploadPickedImage(asset, accessToken, "profile_avatar");
      setMediaAssets((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
      setAvatarSheetVisible(false);
      setMediaSuccess("Avatar uploaded. Review started.");
      await loadProfile();
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload avatar");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [accessToken, loadProfile, onSessionInvalid]);

  const onPickAvatar = useCallback(async (): Promise<void> => {
    try {
      const asset = await pickSingleImage();
      if (asset) {
        await uploadAvatarAsset(asset);
      }
    } catch (requestError) {
      setMediaError(asError(requestError, "Unable to choose avatar"));
    }
  }, [uploadAvatarAsset]);

  const onAvatarPress = useCallback((): void => {
    if (mediaUploading) {
      return;
    }
    setAvatarSheetVisible(true);
  }, [mediaUploading]);

  const onRemoveAvatar = useCallback(async (): Promise<void> => {
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const updated = await removeMyAvatar(accessToken);
      setProfile(updated);
      setForm(buildProfileForm(updated));
      setAvatarSheetVisible(false);
      setAvatarPreviewVisible(false);
      setMediaSuccess("Active avatar removed.");
      await loadProfile();
    } catch (requestError) {
      const message = asError(requestError, "Unable to remove avatar");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [accessToken, loadProfile, onSessionInvalid]);

  const onDeleteAvatarMedia = useCallback(
    async (mediaId: string): Promise<void> => {
      setMediaUploading(true);
      setMediaError(null);
      setMediaSuccess(null);
      try {
        await deleteOwnedMedia(mediaId, accessToken);
        setAvatarSheetVisible(false);
        setAvatarPreviewVisible(false);
        setMediaSuccess("Pending avatar removed.");
        await loadProfile();
      } catch (requestError) {
        const message = asError(requestError, "Unable to remove pending avatar");
        setMediaError(message);
        if (shouldForceSignOut(message)) {
          onSessionInvalid();
        }
      } finally {
        setMediaUploading(false);
      }
    },
    [accessToken, loadProfile, onSessionInvalid]
  );

  const onRemoveVisibleAvatar = useCallback((): void => {
    const removePendingOnly = !profile?.activeAvatar && profile?.pendingAvatar;
    Alert.alert(
      "Remove photo",
      removePendingOnly
        ? "Remove your pending profile photo?"
        : "Remove your current profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            if (removePendingOnly) {
              void onDeleteAvatarMedia(profile.pendingAvatar!.mediaId);
            } else {
              void onRemoveAvatar();
            }
          }
        }
      ]
    );
  }, [onDeleteAvatarMedia, onRemoveAvatar, profile?.activeAvatar, profile?.pendingAvatar]);

  const onDeleteMedia = useCallback(
    async (mediaId: string): Promise<void> => {
      setMediaUploading(true);
      setMediaError(null);
      setMediaSuccess(null);
      try {
        await deleteOwnedMedia(mediaId, accessToken);
        setMediaSuccess("Media deleted.");
        await loadProfile();
      } catch (requestError) {
        const message = asError(requestError, "Unable to delete media");
        setMediaError(message);
        if (shouldForceSignOut(message)) {
          onSessionInvalid();
        }
      } finally {
        setMediaUploading(false);
      }
    },
    [accessToken, loadProfile, onSessionInvalid]
  );

  const onPickGalleryImage = useCallback(async (): Promise<void> => {
    try {
      const asset = await pickSingleImage();
      if (asset) {
        setGalleryAsset(asset);
      }
    } catch (requestError) {
      setMediaError(asError(requestError, "Unable to choose work photo"));
    }
  }, []);

  const onUploadGalleryImage = useCallback(async (): Promise<void> => {
    if (!galleryAsset) {
      setMediaError("Choose a work image first.");
      return;
    }
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const uploaded = await uploadPickedImage(galleryAsset, accessToken, "profile_gallery");
      setMediaAssets((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
      setGalleryAsset(null);
      setMediaSuccess("Work sample uploaded. Review started.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload work photo");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [accessToken, galleryAsset, onSessionInvalid]);

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="profile-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Profile</Text>
        <Text style={styles.screenTitle}>Present yourself with confidence</Text>
        <Text style={styles.screenSubtitle}>
          A stronger profile header, a clearer avatar flow, and skills you can refine any time.
        </Text>
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      {success ? <Banner tone="success" message={success} /> : null}

      <View style={localStyles.heroCard}>
        <View style={localStyles.heroBanner}>
          <View style={localStyles.heroBannerGlow} />
        </View>
        <View style={localStyles.heroBody}>
          <View style={localStyles.heroTopRow}>
            <Pressable
              onPress={onAvatarPress}
              testID="profile-avatar-trigger"
              style={{ position: "relative" }}
            >
              <MemberAvatar
                name={profile?.displayName ?? user.publicUserId}
                avatar={displayAvatar}
                emptyState={hasDisplayedPhoto ? "initials" : "placeholder"}
                size={108}
              />
              <View
                style={{
                  position: "absolute",
                  right: -6,
                  bottom: 4,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: "rgba(20,20,28,0.86)"
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>
                  {hasDisplayedPhoto ? "Photo" : "Upload"}
                </Text>
              </View>
            </Pressable>
            <View style={localStyles.heroIdentity}>
              <Text style={localStyles.heroName}>{profile?.displayName ?? "IllamHelp member"}</Text>
              <Text style={localStyles.heroHandle} testID="profile-user-id">
                @{profile?.userId ?? user.publicUserId}
              </Text>
            </View>
          </View>
          <Text style={localStyles.heroHeadline}>{heroHeadline}</Text>
          <Text style={styles.dataMeta}>
            {hasDisplayedPhoto
              ? "Tap your photo to view, replace, or remove it."
              : "Tap your avatar to open upload options when you are ready."}
          </Text>
          <View style={localStyles.heroMetaRow}>
            <View style={localStyles.metaChip}>
              <Text style={localStyles.metaChipLabel}>
                {profile?.verified ? "Verified member" : "Verification pending"}
              </Text>
            </View>
            {heroLocation ? (
              <View style={localStyles.metaChip}>
                <Text style={localStyles.metaChipLabel}>{heroLocation}</Text>
              </View>
            ) : null}
            <View style={localStyles.metaChip}>
              <Text style={localStyles.metaChipLabel}>{form?.serviceSkills.length ?? 0} skills</Text>
            </View>
          </View>
          {mediaError ? <Banner tone="error" message={mediaError} testID="profile-media-error" /> : null}
          {mediaSuccess ? <Banner tone="success" message={mediaSuccess} testID="profile-media-success" /> : null}
          <View style={localStyles.splitRow}>
            <View style={[localStyles.infoTile, { flex: 1 }]}>
              <Text style={styles.dataTitle}>Avatar review</Text>
              <Text style={styles.dataMeta}>
                {profile?.pendingAvatar
                  ? `Pending avatar review · ${profile.pendingAvatar.state.replace(/_/g, " ")}`
                  : "No pending avatar review"}
              </Text>
              {profile?.pendingAvatar?.moderationReasonCodes.length ? (
                <Text style={styles.dataMeta}>
                  {profile.pendingAvatar.moderationReasonCodes.join(", ")}
                </Text>
              ) : null}
              {profile?.pendingAvatar ? (
                <Text style={styles.dataMeta}>
                  Your live photo stays visible until review finishes.
                </Text>
              ) : null}
            </View>
            <View style={[localStyles.infoTile, { flex: 1 }]}>
              <Text style={styles.dataTitle}>Visibility snapshot</Text>
              <Text style={styles.dataMeta}>
                Approved photo shows on people, privacy, and profile surfaces.
              </Text>
              <Text style={styles.dataMeta}>
                {avatarCandidates.length} avatar submission{avatarCandidates.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={avatarSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarSheetVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(12, 12, 20, 0.48)",
            justifyContent: "flex-end"
          }}
          onPress={() => setAvatarSheetVisible(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 18,
              gap: 10,
              borderTopWidth: 1,
              borderColor: theme.colors.line
            }}
          >
            <Text style={[styles.cardTitle, { fontSize: 18 }]}>Profile photo</Text>
            <Text style={styles.cardBodyMuted}>
              {hasDisplayedPhoto
                ? "Manage the photo shown on your profile hero."
                : "Add a profile photo whenever you are ready."}
            </Text>
            {hasDisplayedPhoto ? (
              <>
                <AppButton
                  label="View photo"
                  onPress={() => {
                    setAvatarSheetVisible(false);
                    setAvatarPreviewVisible(true);
                  }}
                  variant="secondary"
                  testID="profile-avatar-view"
                />
                <AppButton
                  label="Edit photo"
                  onPress={() => {
                    setAvatarSheetVisible(false);
                    void onPickAvatar();
                  }}
                  variant="secondary"
                  testID="profile-avatar-edit"
                />
                <AppButton
                  label="Remove photo"
                  onPress={onRemoveVisibleAvatar}
                  variant="ghost"
                  testID="profile-avatar-remove"
                />
              </>
            ) : (
              <AppButton
                label="Upload photo"
                onPress={() => {
                  setAvatarSheetVisible(false);
                  void onPickAvatar();
                }}
                variant="secondary"
                testID="profile-avatar-upload"
              />
            )}
            <AppButton
              label="Cancel"
              onPress={() => setAvatarSheetVisible(false)}
              variant="ghost"
              testID="profile-avatar-cancel"
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={avatarPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPreviewVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(12, 12, 20, 0.72)",
            justifyContent: "center",
            padding: 20
          }}
          onPress={() => setAvatarPreviewVisible(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              borderRadius: 28,
              overflow: "hidden",
              backgroundColor: theme.colors.surface
            }}
          >
            {displayAvatar?.downloadUrl ? (
              <Image
                source={{ uri: displayAvatar.downloadUrl }}
                style={{ width: "100%", aspectRatio: 1 }}
                resizeMode="cover"
              />
            ) : null}
            <View style={{ padding: 16, gap: 6 }}>
              <Text style={styles.cardTitle}>{profile?.displayName ?? "Profile photo"}</Text>
              <Text style={styles.cardBodyMuted}>
                {profile?.activeAvatar ? "Approved live photo" : "Pending photo preview"}
              </Text>
              <AppButton
                label="Close"
                onPress={() => setAvatarPreviewVisible(false)}
                variant="ghost"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {form ? (
        <>
          <SectionCard title="Profile details" subtitle="Update the private information you choose to share later.">
            <InputField
              label="First name"
              value={form.firstName}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, firstName: value } : previous))
              }
              testID="profile-first-name"
            />
            <InputField
              label="Last name"
              value={form.lastName}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, lastName: value } : previous))
              }
              testID="profile-last-name"
            />
            <InputField
              label="City"
              value={form.city}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, city: value } : previous))
              }
              testID="profile-city"
            />
            <InputField
              label="Area"
              value={form.area}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, area: value } : previous))
              }
              testID="profile-area"
            />
            <InputField
              label="Email"
              value={form.email}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, email: value } : previous))
              }
              placeholder={profile?.contact.emailMasked ?? "email@example.com"}
              testID="profile-email"
            />
            <InputField
              label="Phone"
              value={form.phone}
              onChangeText={(value) =>
                setForm((previous) => (previous ? { ...previous, phone: value } : previous))
              }
              placeholder={profile?.contact.phoneMasked ?? "+919876543210"}
              testID="profile-phone"
            />
            <InputField
              label="Alternate phone"
              value={form.alternatePhone}
              onChangeText={(value) =>
                setForm((previous) =>
                  previous ? { ...previous, alternatePhone: value } : previous
                )
              }
              testID="profile-alternate-phone"
            />
            <InputField
              label="Address"
              value={form.fullAddress}
              onChangeText={(value) =>
                setForm((previous) =>
                  previous ? { ...previous, fullAddress: value } : previous
                )
              }
              multiline
              testID="profile-full-address"
            />
          </SectionCard>

          <SectionCard
            title="Skills you can edit any time"
            subtitle="Add services, tune the level, and remove anything that no longer fits."
          >
            <Text style={styles.fieldLabel}>Service from catalog</Text>
            <Pressable
              style={styles.input}
              onPress={() => setSkillPickerVisible(true)}
              testID="profile-skill-picker-trigger"
            >
              <Text style={{ color: theme.colors.ink, fontWeight: "600" }}>
                {selectedServiceOption?.label ?? "Select a service"}
              </Text>
              <Text style={[styles.dataMeta, { marginTop: 4 }]}>
                Search the house-work catalog and choose Other only for custom entries.
              </Text>
            </Pressable>
            <Modal
              visible={skillPickerVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setSkillPickerVisible(false)}
            >
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: "rgba(12, 12, 20, 0.48)",
                  justifyContent: "flex-end"
                }}
                onPress={() => setSkillPickerVisible(false)}
              >
                <Pressable
                  onPress={(event) => event.stopPropagation()}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    padding: 18,
                    gap: 12,
                    maxHeight: "78%"
                  }}
                >
                  <Text style={[styles.cardTitle, { fontSize: 18 }]}>Choose a service</Text>
                  <InputField
                    label="Search services"
                    value={skillSearch}
                    onChangeText={setSkillSearch}
                    placeholder="Painting, tutoring, deep cleaning..."
                    testID="profile-skill-search"
                  />
                  <ScrollView
                    style={{ maxHeight: 360 }}
                    contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {groupedCatalog.map(([group, options]) => (
                      <View key={group} style={{ gap: 8 }}>
                        <Text
                          style={{
                            color: theme.colors.muted,
                            fontSize: 12,
                            fontWeight: "800",
                            textTransform: "uppercase"
                          }}
                        >
                          {group}
                        </Text>
                        <View style={{ gap: 8 }}>
                          {options.map((option) => (
                            <Pressable
                              key={option.value}
                              style={[
                                styles.dataRow,
                                option.value === selectedServiceValue
                                  ? {
                                      borderColor: theme.colors.brand,
                                      backgroundColor: theme.colors.surface
                                    }
                                  : null
                              ]}
                              onPress={() => {
                                setSelectedServiceValue(option.value);
                                setSkillPickerVisible(false);
                                setSkillSearch("");
                              }}
                              testID={`profile-skill-option-${option.value}`}
                            >
                              <Text style={styles.dataTitle}>{option.label}</Text>
                              <Text style={styles.dataMeta}>{option.group}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                  <AppButton
                    label="Close"
                    onPress={() => setSkillPickerVisible(false)}
                    variant="ghost"
                  />
                </Pressable>
              </Pressable>
            </Modal>
            <Text style={styles.fieldLabel}>Proficiency</Text>
            <View style={styles.roleRow}>
              {PROFICIENCY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[
                    styles.roleChip,
                    selectedProficiency === option ? styles.roleChipSelected : null
                  ]}
                  onPress={() => setSelectedProficiency(option)}
                  testID={`profile-skill-proficiency-${option}`}
                >
                  <Text
                    style={[
                      styles.roleChipLabel,
                      selectedProficiency === option ? styles.roleChipLabelSelected : null
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
            {selectedServiceValue === "other" ? (
              <InputField
                label="Custom service name"
                value={customSkillName}
                onChangeText={setCustomSkillName}
                placeholder="Babysitting, tile polish..."
                testID="profile-skill-custom"
              />
            ) : null}
            <AppButton
              label="Add skill"
              onPress={onAddSkill}
              variant="secondary"
              testID="profile-skill-add"
            />

            {form.serviceSkills.length === 0 ? (
              <Text style={styles.cardBodyMuted}>No skills added yet.</Text>
            ) : (
              form.serviceSkills.map((skill) => (
                <View key={skill.jobName} style={localStyles.skillCard} testID={`profile-skill-card-${skillTestId(skill.jobName)}`}>
                  <Text style={styles.dataTitle}>{skill.jobName}</Text>
                  <Text style={styles.dataMeta}>
                    {skill.source === "custom" ? "Custom skill" : "Catalog skill"}
                  </Text>
                  <View style={styles.roleRow}>
                    {PROFICIENCY_OPTIONS.map((option) => (
                      <Pressable
                        key={option}
                        style={[
                          styles.roleChip,
                          skill.proficiency === option ? styles.roleChipSelected : null
                        ]}
                        onPress={() => onChangeSkillProficiency(skill.jobName, option)}
                        testID={`profile-skill-level-${skillTestId(skill.jobName)}-${option}`}
                      >
                        <Text
                          style={[
                            styles.roleChipLabel,
                            skill.proficiency === option ? styles.roleChipLabelSelected : null
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <AppButton
                    label="Remove"
                    onPress={() => onRemoveSkill(skill.jobName)}
                    variant="ghost"
                    testID={`profile-skill-remove-${skillTestId(skill.jobName)}`}
                  />
                </View>
              ))
            )}

            <AppButton
              label={saving ? "Saving..." : "Save profile"}
              onPress={() => {
                void onSaveProfile();
              }}
              disabled={saving}
              testID="profile-save"
            />
          </SectionCard>
        </>
      ) : null}

      <SectionCard title="Professional media">
        <Text style={styles.cardBody}>
          Upload work photos separately from your avatar. Admin review still applies.
        </Text>
        <Text style={styles.dataMeta}>{galleryAsset?.fileName ?? "No work image selected"}</Text>
        <View style={localStyles.splitRow}>
          <View style={{ flex: 1 }}>
            <AppButton
              label="Choose work photo"
              onPress={() => {
                void onPickGalleryImage();
              }}
              variant="secondary"
              testID="profile-media-pick"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              label={mediaUploading ? "Uploading..." : "Upload work photo"}
              onPress={() => {
                void onUploadGalleryImage();
              }}
              disabled={mediaUploading}
              testID="profile-media-upload"
            />
          </View>
        </View>
        {galleryItems.length === 0 ? <Text style={styles.cardBodyMuted}>No media uploaded yet.</Text> : null}
        {galleryItems.map((asset) => (
          <View key={asset.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>{asset.objectKey.split("/").slice(-1)[0]}</Text>
            <Text style={styles.dataMeta}>
              {asset.context.replace(/_/g, " ")} · {asset.state.replace(/_/g, " ")}
            </Text>
            <Text style={styles.dataMeta}>
              {formatBytes(asset.fileSizeBytes)} · {formatDate(asset.createdAt)}
            </Text>
            <AppButton
              label="Delete"
              onPress={() => {
                void onDeleteMedia(asset.id);
              }}
              variant="ghost"
            />
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Public gallery preview">
        <Text style={styles.cardBody}>
          This matches what other members can open publicly after moderation approval.
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
        ) : (
          publicMediaAssets.map((asset) => (
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
          ))
        )}
      </SectionCard>

      {loading ? <Text style={styles.cardBodyMuted}>Loading profile...</Text> : null}
      <AppButton label="Sign out" onPress={onSignOut} variant="ghost" testID="profile-signout" />
    </ScrollView>
  );
}
