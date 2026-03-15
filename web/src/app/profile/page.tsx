"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";

import { MemberAvatar } from "@/components/MemberAvatar";
import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  SelectInput,
  TextInput
} from "@/components/ui/primitives";
import {
  DashboardResponse,
  deleteOwnedMedia,
  formatDate,
  getMyDashboard,
  getServiceCatalog,
  listMyMedia,
  listPublicApprovedMedia,
  MediaAssetRecord,
  ProfileRecord,
  PublicMediaAssetRecord,
  removeMyAvatar,
  type ServiceCatalogOption,
  type ServiceSkill,
  updateMyProfile
} from "@/lib/api";
import { uploadMemberMedia } from "@/lib/media-upload";
import { FALLBACK_SERVICE_CATALOG, PROFICIENCY_OPTIONS } from "@/lib/service-catalog";

interface ProfileMetrics {
  totalJobs: number;
  totalConnections: number;
  pendingConnections: number;
  consentRequests: number;
  activeConsentGrants: number;
}

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

function buildForm(profile: ProfileRecord): ProfileFormState {
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function ProfilePage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [metrics, setMetrics] = useState<ProfileMetrics>({
    totalJobs: 0,
    totalConnections: 0,
    pendingConnections: 0,
    consentRequests: 0,
    activeConsentGrants: 0
  });
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<ServiceCatalogOption[]>(FALLBACK_SERVICE_CATALOG);
  const [selectedCatalogId, setSelectedCatalogId] = useState(
    FALLBACK_SERVICE_CATALOG[0]?.value ?? ""
  );
  const [selectedProficiency, setSelectedProficiency] = useState<
    (typeof PROFICIENCY_OPTIONS)[number]
  >("intermediate");
  const [customSkillName, setCustomSkillName] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);

  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);

  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const skillPickerRef = useRef<HTMLDivElement | null>(null);
  const [recentJobs, setRecentJobs] = useState<DashboardResponse["recentJobs"]>([]);

  const serviceCatalogById = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.value, item])),
    [catalog]
  );

  const avatarCandidates = useMemo(
    () => mediaAssets.filter((item) => item.context === "profile_avatar"),
    [mediaAssets]
  );
  const galleryAssets = useMemo(
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
  const selectedCatalogOption = serviceCatalogById[selectedCatalogId] ?? null;

  const heroLocation = useMemo(
    () => [form?.area?.trim(), form?.city?.trim()].filter(Boolean).join(", "),
    [form?.area, form?.city]
  );

  const heroHeadline = useMemo(() => {
    if (!form?.serviceSkills.length) {
      return "Add your strongest services so people immediately understand what you do best.";
    }
    return form.serviceSkills
      .slice(0, 3)
      .map((skill) => `${skill.jobName} (${skill.proficiency})`)
      .join(" · ");
  }, [form?.serviceSkills]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (
        avatarMenuRef.current &&
        !avatarMenuRef.current.contains(event.target as Node)
      ) {
        setAvatarMenuOpen(false);
      }
      if (
        skillPickerRef.current &&
        !skillPickerRef.current.contains(event.target as Node)
      ) {
        setSkillPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

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
      setPublicGalleryError(
        requestError instanceof Error ? requestError.message : "Unable to load public media"
      );
      setPublicMediaAssets([]);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, []);

  const loadProfileData = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboard, media, catalogResponse] = await Promise.all([
        getMyDashboard(accessToken),
        listMyMedia(accessToken),
        getServiceCatalog().catch(() => ({
          options: FALLBACK_SERVICE_CATALOG,
          proficiencies: PROFICIENCY_OPTIONS
        }))
      ]);
      setMetrics({
        totalJobs: dashboard.metrics.totalJobs,
        totalConnections: dashboard.metrics.totalConnections,
        pendingConnections: dashboard.metrics.pendingConnections,
        consentRequests: dashboard.metrics.consentRequests,
        activeConsentGrants: dashboard.metrics.activeConsentGrants
      });
      setRecentJobs(dashboard.recentJobs);
      setProfile(dashboard.profile);
      setForm(buildForm(dashboard.profile));
      setMediaAssets(media);
      setCatalog(resolveServiceCatalog(catalogResponse.options));
      setPublicGalleryOwner(dashboard.profile.userId);
      await loadPublicGallery(dashboard.profile.userId);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load profile analytics"
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadPublicGallery]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const onAddSkill = (): void => {
    if (!form) return;
    const selected = serviceCatalogById[selectedCatalogId];
    const isCustom = !selected || selected.value === "other";
    const jobName = (isCustom ? customSkillName : selected.label).trim();
    if (!jobName) return;
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
    setSkillPickerOpen(false);
  };

  const onRemoveSkill = (jobName: string): void => {
    setForm((previous) =>
      previous
        ? {
            ...previous,
            serviceSkills: previous.serviceSkills.filter((skill) => skill.jobName !== jobName)
          }
        : previous
    );
  };

  const onChangeSkillProficiency = (
    jobName: string,
    proficiency: (typeof PROFICIENCY_OPTIONS)[number]
  ): void => {
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
  };

  const onSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !form) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
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
      setForm(buildForm(updated));
      setSaveMessage("Profile updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatarFile = async (file: File): Promise<void> => {
    if (!accessToken) {
      setAvatarError("Sign in again to update your profile photo.");
      return;
    }
    setAvatarLoading(true);
    setAvatarError(null);
    setAvatarMessage(null);
    try {
      const uploaded = await uploadMemberMedia(file, accessToken, "profile_avatar");
      setMediaAssets((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
      setAvatarMessage("Avatar uploaded. It is now in the moderation queue.");
      setAvatarMenuOpen(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      await loadProfileData();
    } catch (requestError) {
      setAvatarError(
        requestError instanceof Error ? requestError.message : "Unable to upload avatar"
      );
    } finally {
      setAvatarLoading(false);
    }
  };

  const onAvatarChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }
    void uploadAvatarFile(file);
  };

  const onAvatarPress = (): void => {
    if (avatarLoading) {
      return;
    }
    setAvatarMenuOpen((previous) => !previous);
  };

  const onRemoveAvatar = async (): Promise<void> => {
    if (!accessToken) return;
    setAvatarLoading(true);
    setAvatarError(null);
    setAvatarMessage(null);
    try {
      const updated = await removeMyAvatar(accessToken);
      setProfile(updated);
      setForm(buildForm(updated));
      setAvatarMenuOpen(false);
      setAvatarPreviewOpen(false);
      setAvatarMessage(
        "Active avatar removed. Initials will be shown until a new one is approved."
      );
      await loadProfileData();
    } catch (requestError) {
      setAvatarError(
        requestError instanceof Error ? requestError.message : "Unable to remove avatar"
      );
    } finally {
      setAvatarLoading(false);
    }
  };

  const onRemoveVisiblePhoto = async (): Promise<void> => {
    const pendingAvatar = profile?.pendingAvatar ?? null;
    const removePendingOnly = !profile?.activeAvatar && pendingAvatar;
    const message = removePendingOnly
      ? "Remove your pending profile photo?"
      : "Remove your current profile photo?";
    if (!window.confirm(message)) {
      return;
    }
    if (removePendingOnly) {
      await onDeleteAvatarMedia(pendingAvatar.mediaId);
      return;
    }
    await onRemoveAvatar();
  };

  const onDeleteAvatarMedia = async (mediaId: string): Promise<void> => {
    if (!accessToken) return;
    setAvatarLoading(true);
    setAvatarError(null);
    setAvatarMessage(null);
    try {
      await deleteOwnedMedia(mediaId, accessToken);
      setAvatarMenuOpen(false);
      setAvatarPreviewOpen(false);
      setAvatarMessage("Pending avatar removed.");
      await loadProfileData();
    } catch (requestError) {
      setAvatarError(
        requestError instanceof Error ? requestError.message : "Unable to delete avatar media"
      );
    } finally {
      setAvatarLoading(false);
    }
  };

  const onMediaFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setMediaFile(event.target.files?.[0] ?? null);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const onUploadMedia = async (): Promise<void> => {
    if (!accessToken || !mediaFile) {
      setUploadError("Choose a photo or video to upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const uploaded = await uploadMemberMedia(mediaFile, accessToken, "profile_gallery");
      setMediaAssets((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)]);
      setUploadSuccess("Uploaded successfully. Review started.");
      setMediaFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (requestError) {
      setUploadError(
        requestError instanceof Error ? requestError.message : "Unable to upload media file"
      );
    } finally {
      setUploading(false);
    }
  };

  const onDeleteMedia = async (mediaId: string): Promise<void> => {
    if (!accessToken) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await deleteOwnedMedia(mediaId, accessToken);
      setMediaAssets((previous) => previous.filter((item) => item.id !== mediaId));
      setUploadSuccess("Media deleted.");
    } catch (requestError) {
      setUploadError(requestError instanceof Error ? requestError.message : "Unable to delete media");
    } finally {
      setUploading(false);
    }
  };

  const mediaColumns: ColumnDef<MediaAssetRecord>[] = [
    {
      accessorKey: "kind",
      header: "Type",
      cell: ({ row }) => (
        <span className="pill" style={{ textTransform: "capitalize" }}>
          {row.original.context.replaceAll("_", " ")}
        </span>
      )
    },
    {
      accessorKey: "objectKey",
      header: "Filename",
      cell: ({ row }) => {
        const parts = row.original.objectKey.split("/");
        return (
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>{parts.at(-1) ?? "unknown"}</span>
        );
      }
    },
    {
      accessorKey: "state",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.state.replaceAll("_", " ")}</span>
    },
    {
      accessorKey: "fileSizeBytes",
      header: "Size",
      cell: ({ row }) => <span className="muted-text">{formatBytes(row.original.fileSizeBytes)}</span>
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button type="button" variant="ghost" onClick={() => void onDeleteMedia(row.original.id)}>
          Delete
        </Button>
      )
    }
  ];

  const recentJobsColumns: ColumnDef<DashboardResponse["recentJobs"][0]>[] = [
    {
      accessorKey: "title",
      header: "Job",
      cell: ({ row }) => <span style={{ fontWeight: 600, color: "var(--ink)" }}>{row.original.title}</span>
    },
    {
      accessorKey: "category",
      header: "Category"
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <span className="pill">{row.original.status}</span>
    },
    {
      accessorKey: "locationText",
      header: "Location",
      cell: ({ row }) => <span className="muted-text">{row.original.locationText}</span>
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="muted-text">{formatDate(row.original.createdAt).split(",")[0]}</span>
      )
    }
  ];

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Profile"
            title="Shape how people see your work"
            subtitle="A cleaner profile hero, stronger avatar presence, and skills you can refine at any time."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}

              <Card
                className="stack"
                style={{ padding: 0, overflow: "hidden", gap: 0 }}
              >
                <div
                  style={{
                    minHeight: "180px",
                    background:
                      "radial-gradient(circle at top left, rgba(255,255,255,0.38), transparent 32%), radial-gradient(circle at bottom right, rgba(112,92,255,0.2), transparent 36%), linear-gradient(135deg, #f6e0bd 0%, #ffe6a8 28%, #ffd1b5 58%, #e5d3ff 100%)"
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gap: "20px",
                    padding: "0 var(--spacing-xl) var(--spacing-xl)",
                    marginTop: "-62px"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "18px",
                      flexWrap: "wrap",
                      alignItems: "flex-end"
                    }}
                  >
                    <div style={{ display: "flex", gap: "18px", alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div ref={avatarMenuRef} style={{ position: "relative" }}>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={onAvatarChange}
                          data-testid="profile-avatar-input"
                          style={{ display: "none" }}
                        />
                        <button
                          type="button"
                          onClick={onAvatarPress}
                          data-testid="profile-avatar-trigger"
                          aria-haspopup="menu"
                          aria-expanded={avatarMenuOpen}
                          title={hasDisplayedPhoto ? "Open profile photo options" : "Upload profile photo"}
                          style={{
                            position: "relative",
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            cursor: avatarLoading ? "progress" : "pointer"
                          }}
                        >
                          <MemberAvatar
                            name={profile?.displayName ?? user?.publicUserId ?? "IllamHelp member"}
                            avatar={displayAvatar}
                            emptyState={hasDisplayedPhoto ? "initials" : "placeholder"}
                            size={124}
                            style={{
                              border: "5px solid rgba(255,255,255,0.95)",
                              boxShadow: "0 22px 40px rgba(18, 16, 32, 0.16)"
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: "-6px",
                              bottom: "6px",
                              borderRadius: "999px",
                              padding: "8px 10px",
                              background: "rgba(18, 16, 32, 0.86)",
                              color: "#fff",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              boxShadow: "0 12px 20px rgba(18, 16, 32, 0.18)"
                            }}
                          >
                            {hasDisplayedPhoto ? "Photo" : "Upload"}
                          </span>
                        </button>

                        {avatarMenuOpen ? (
                          <Card
                            soft
                            className="stack"
                            style={{
                              position: "absolute",
                              top: "calc(100% + 12px)",
                              left: 0,
                              zIndex: 20,
                              minWidth: "220px",
                              padding: "10px",
                              boxShadow: "0 18px 36px rgba(18, 16, 32, 0.18)"
                            }}
                          >
                            {hasDisplayedPhoto ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => {
                                    setAvatarPreviewOpen(true);
                                    setAvatarMenuOpen(false);
                                  }}
                                  data-testid="profile-avatar-view"
                                >
                                  View photo
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => avatarInputRef.current?.click()}
                                  data-testid="profile-avatar-edit"
                                >
                                  Edit photo
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => void onRemoveVisiblePhoto()}
                                  data-testid="profile-avatar-remove"
                                >
                                  Remove photo
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => avatarInputRef.current?.click()}
                                  data-testid="profile-avatar-upload"
                                >
                                  Upload photo
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setAvatarMenuOpen(false)}
                                  data-testid="profile-avatar-cancel"
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                          </Card>
                        ) : null}
                      </div>
                      <div className="stack" style={{ gap: "8px", paddingBottom: "4px" }}>
                        <div className="pill" style={{ width: "fit-content" }}>
                          {profile?.verified ? "Verified member" : "Verification pending"}
                        </div>
                        <div style={{ fontSize: "2.2rem", fontWeight: 800 }}>
                          {profile?.displayName ?? "IllamHelp member"}
                        </div>
                        <div
                          className="muted-text"
                          style={{ fontSize: "1rem" }}
                          data-testid="profile-user-id"
                        >
                          {profile?.userId ?? user?.publicUserId}
                        </div>
                        <div className="muted-text" style={{ maxWidth: "60ch" }}>
                          {heroHeadline}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {heroLocation ? <span className="pill">{heroLocation}</span> : null}
                          <span className="pill">{metrics.totalConnections} connections</span>
                          <span className="pill">{metrics.totalJobs} jobs</span>
                          <span className="pill">{metrics.activeConsentGrants} active shares</span>
                        </div>
                        <div className="muted-text" style={{ fontSize: "0.92rem" }}>
                          {hasDisplayedPhoto
                            ? "Click your photo to view, replace, or remove it."
                            : "Click your avatar to upload a profile photo when you are ready."}
                        </div>
                      </div>
                    </div>
                    <div className="pill" style={{ alignSelf: "start" }}>
                      {avatarLoading ? "Updating photo..." : "Photo-first profile hero"}
                    </div>
                  </div>

                  {avatarError ? <Banner tone="error">{avatarError}</Banner> : null}
                  {avatarMessage ? <Banner tone="success">{avatarMessage}</Banner> : null}
                  {avatarPreviewOpen && displayAvatar?.downloadUrl ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(10, 10, 18, 0.72)",
                        display: "grid",
                        placeItems: "center",
                        padding: "24px",
                        zIndex: 40
                      }}
                      onClick={() => setAvatarPreviewOpen(false)}
                    >
                      <div
                        style={{
                          position: "relative",
                          maxWidth: "min(92vw, 520px)",
                          width: "100%",
                          borderRadius: "28px",
                          overflow: "hidden",
                          background: "var(--surface)"
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Image
                          src={displayAvatar.downloadUrl}
                          alt={`${profile?.displayName ?? "Member"} profile photo`}
                          width={720}
                          height={720}
                          unoptimized
                          style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                        />
                        <div style={{ padding: "14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{profile?.displayName ?? "Profile photo"}</div>
                            <div className="muted-text">
                              {profile?.activeAvatar
                                ? "Approved live photo"
                                : "Pending photo preview"}
                            </div>
                          </div>
                          <Button type="button" variant="ghost" onClick={() => setAvatarPreviewOpen(false)}>
                            Close
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid two" style={{ alignItems: "start", gap: "14px" }}>
                    <Card soft>
                      <div className="stack" style={{ gap: "8px" }}>
                        <div style={{ fontWeight: 700 }}>Profile photo status</div>
                        <div className="muted-text">
                          {profile?.activeAvatar
                            ? "Your approved avatar is live on people, privacy, and profile surfaces."
                            : "No approved avatar is live yet. Your initials stay visible until one is approved."}
                        </div>
                        {profile?.pendingAvatar ? (
                          <>
                            <div style={{ fontWeight: 700 }}>Pending avatar review</div>
                            <span className="pill">
                              Status · {profile.pendingAvatar.state.replaceAll("_", " ")}
                            </span>
                            {profile.pendingAvatar.moderationReasonCodes.length > 0 ? (
                              <div className="muted-text">
                                Notes: {profile.pendingAvatar.moderationReasonCodes.join(", ")}
                              </div>
                            ) : null}
                            <div className="muted-text">
                              Your current live photo stays unchanged until review finishes.
                            </div>
                          </>
                        ) : (
                          <span className="pill">No pending review</span>
                        )}
                      </div>
                    </Card>
                    <Card soft>
                      <div className="stack" style={{ gap: "8px" }}>
                        <div style={{ fontWeight: 700 }}>Trust snapshot</div>
                        <div className="muted-text">
                          Your profile photo and work gallery still flow through the current admin moderation queue.
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <span className="pill">
                            {mediaAssets.filter((item) =>
                              ["uploaded", "scanning", "ai_reviewed", "human_review_pending"].includes(
                                item.state
                              )
                            ).length}{" "}
                            media in review
                          </span>
                          <span className="pill">{metrics.consentRequests} privacy requests</span>
                          <span className="pill">{metrics.pendingConnections} pending connections</span>
                        </div>
                        <div>
                          <Link href="/consent" className="button-link">
                            <Button variant="ghost">Open privacy workspace →</Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </Card>

              {form ? (
                <div className="grid two" style={{ alignItems: "start" }}>
                  <Card className="stack">
                    <div className="stack" style={{ gap: "6px" }}>
                      <h3 style={{ fontFamily: "var(--font-display)" }}>Profile details</h3>
                      <p className="muted-text">
                        Keep your private details current. These stay protected unless you explicitly share them.
                      </p>
                    </div>
                    <form className="stack" onSubmit={onSave}>
                      <div className="grid two" style={{ alignItems: "start" }}>
                        <Field label="First Name" hint="Required">
                          <TextInput
                            value={form.firstName}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, firstName: e.target.value } : prev))
                            }
                            required
                          />
                        </Field>
                        <Field label="Last Name">
                          <TextInput
                            value={form.lastName}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, lastName: e.target.value } : prev))
                            }
                          />
                        </Field>
                        <Field label="City">
                          <TextInput
                            value={form.city}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, city: e.target.value } : prev))
                            }
                          />
                        </Field>
                        <Field label="Area">
                          <TextInput
                            value={form.area}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, area: e.target.value } : prev))
                            }
                          />
                        </Field>
                        <Field
                          label="Email"
                          hint={
                            profile?.contact.emailMasked
                              ? `Masked for others: ${profile.contact.emailMasked}`
                              : "Private email address."
                          }
                        >
                          <TextInput
                            type="email"
                            value={form.email}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, email: e.target.value } : prev))
                            }
                          />
                        </Field>
                        <Field
                          label="Phone"
                          hint={
                            profile?.contact.phoneMasked
                              ? `Masked for others: ${profile.contact.phoneMasked}`
                              : "Private primary phone."
                          }
                        >
                          <TextInput
                            data-testid="profile-phone-input"
                            value={form.phone}
                            onChange={(e) =>
                              setForm((prev) => (prev ? { ...prev, phone: e.target.value } : prev))
                            }
                          />
                        </Field>
                        <Field label="Alt Phone">
                          <TextInput
                            data-testid="profile-alt-phone-input"
                            value={form.alternatePhone}
                            onChange={(e) =>
                              setForm((prev) =>
                                prev ? { ...prev, alternatePhone: e.target.value } : prev
                              )
                            }
                          />
                        </Field>
                        <Field label="Address" hint="Never exposed without explicit consent.">
                          <TextInput
                            value={form.fullAddress}
                            onChange={(e) =>
                              setForm((prev) =>
                                prev ? { ...prev, fullAddress: e.target.value } : prev
                              )
                            }
                          />
                        </Field>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button type="submit" disabled={saving}>
                          {saving ? "Saving..." : "Save Profile"}
                        </Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="stack">
                    <div className="stack" style={{ gap: "6px" }}>
                      <h3 style={{ fontFamily: "var(--font-display)" }}>Skills you can edit any time</h3>
                      <p className="muted-text">
                        Add services, adjust your proficiency inline, and remove anything that no longer fits.
                      </p>
                    </div>

                    <div className="grid two" style={{ alignItems: "end" }}>
                      <div className="field">
                        <span className="field-label">Service</span>
                        <div ref={skillPickerRef} style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="input"
                            onClick={() => setSkillPickerOpen((previous) => !previous)}
                            data-testid="profile-skill-picker"
                            style={{
                              width: "100%",
                              textAlign: "left",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              cursor: "pointer"
                            }}
                          >
                            <span>{selectedCatalogOption?.label ?? "Select a service"}</span>
                            <span className="muted-text">Browse</span>
                          </button>
                          <input
                            type="hidden"
                            value={selectedCatalogId}
                            data-testid="profile-skill-catalog"
                            readOnly
                          />
                          {skillPickerOpen ? (
                            <Card
                              soft
                              className="stack"
                              style={{
                                position: "absolute",
                                top: "calc(100% + 10px)",
                                left: 0,
                                right: 0,
                                zIndex: 20,
                                maxHeight: "360px",
                                overflow: "auto",
                                boxShadow: "0 22px 42px rgba(18, 16, 32, 0.18)"
                              }}
                            >
                              <TextInput
                                value={skillSearch}
                                onChange={(event) => setSkillSearch(event.target.value)}
                                placeholder="Search home services"
                                data-testid="profile-skill-search"
                              />
                              {groupedCatalog.length === 0 ? (
                                <EmptyState
                                  title="No matching services"
                                  body="Try a broader search or choose Other for a custom skill."
                                />
                              ) : (
                                groupedCatalog.map(([group, options]) => (
                                  <div key={group} className="stack" style={{ gap: "8px" }}>
                                    <div
                                      className="muted-text"
                                      style={{ fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}
                                    >
                                      {group}
                                    </div>
                                    <div style={{ display: "grid", gap: "8px" }}>
                                      {options.map((option) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => {
                                            setSelectedCatalogId(option.value);
                                            setSkillPickerOpen(false);
                                            setSkillSearch("");
                                          }}
                                          data-testid={`profile-skill-option-${option.value}`}
                                          style={{
                                            borderRadius: "16px",
                                            border: option.value === selectedCatalogId
                                              ? "1px solid var(--brand)"
                                              : "1px solid var(--line)",
                                            background: option.value === selectedCatalogId
                                              ? "color-mix(in srgb, var(--brand) 12%, var(--surface))"
                                              : "var(--surface)",
                                            color: "var(--ink)",
                                            padding: "12px 14px",
                                            textAlign: "left",
                                            fontWeight: 700,
                                            cursor: "pointer"
                                          }}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              )}
                            </Card>
                          ) : null}
                        </div>
                        <span className="field-hint">
                          Pick from the house-work catalog. Choose Other only if you need something custom.
                        </span>
                      </div>
                      <Field label="Proficiency">
                        <SelectInput
                          value={selectedProficiency}
                          onChange={(e) =>
                            setSelectedProficiency(
                              e.target.value as (typeof PROFICIENCY_OPTIONS)[number]
                            )
                          }
                          data-testid="profile-skill-proficiency"
                        >
                          {PROFICIENCY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                    {selectedCatalogId === "other" ? (
                      <Field label="Custom service name">
                        <TextInput
                          value={customSkillName}
                          onChange={(e) => setCustomSkillName(e.target.value)}
                          placeholder="Glass cleaning, babysitting, tile polish..."
                          data-testid="profile-skill-custom"
                        />
                      </Field>
                    ) : null}
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onAddSkill}
                        data-testid="profile-skill-add"
                      >
                        Add skill
                      </Button>
                    </div>

                    {form.serviceSkills.length === 0 ? (
                      <EmptyState
                        title="No skills added yet"
                        body="Choose services you can confidently provide, then set the level that matches your experience."
                      />
                    ) : (
                      <div style={{ display: "grid", gap: "12px" }}>
                        {form.serviceSkills.map((skill) => (
                          <Card key={skill.jobName} soft>
                            <div className="stack" style={{ gap: "12px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "12px",
                                  flexWrap: "wrap",
                                  alignItems: "start"
                                }}
                              >
                                <div className="stack" style={{ gap: "6px" }}>
                                  <div style={{ fontWeight: 700 }}>{skill.jobName}</div>
                                  <div className="muted-text" style={{ fontSize: "0.9rem" }}>
                                    {skill.source === "custom" ? "Custom skill" : "Catalog skill"}
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => onRemoveSkill(skill.jobName)}
                                  data-testid={`profile-skill-remove-${skillTestId(skill.jobName)}`}
                                >
                                  Remove
                                </Button>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 220px)",
                                  gap: "10px"
                                }}
                              >
                                <Field label="Proficiency">
                                  <SelectInput
                                    value={skill.proficiency}
                                    data-testid={`profile-skill-level-${skillTestId(skill.jobName)}`}
                                    onChange={(e) =>
                                      onChangeSkillProficiency(
                                        skill.jobName,
                                        e.target.value as (typeof PROFICIENCY_OPTIONS)[number]
                                      )
                                    }
                                  >
                                    {PROFICIENCY_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </SelectInput>
                                </Field>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              ) : null}

              <div className="grid two" style={{ alignItems: "start" }}>
                <Card className="stack">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "15px"
                    }}
                  >
                    <div>
                      <h3 style={{ fontFamily: "var(--font-display)" }}>Professional media</h3>
                      <p className="muted-text">
                        Work samples stay separate from your avatar and continue through the same moderation flow.
                      </p>
                    </div>
                    <div className="stack" style={{ gap: "10px", alignItems: "start" }}>
                      {uploadError ? <Banner tone="error">{uploadError}</Banner> : null}
                      {uploadSuccess ? <Banner tone="success">{uploadSuccess}</Banner> : null}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                        onChange={onMediaFileChange}
                        style={{ maxWidth: 220 }}
                      />
                      <Button type="button" disabled={uploading} onClick={() => void onUploadMedia()}>
                        {uploading ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                  </div>
                  {galleryAssets.length === 0 ? (
                    <EmptyState
                      title="No gallery media uploaded"
                      body="Your professional verification and work photos will appear here."
                    />
                  ) : (
                    <DataTable columns={mediaColumns} data={galleryAssets} />
                  )}
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Public gallery preview</h3>
                  <p className="muted-text">
                    Preview approved public files. Enter a member ID below.
                  </p>
                  {publicGalleryError ? <Banner tone="error">{publicGalleryError}</Banner> : null}
                  <div className="grid two" style={{ alignItems: "end" }}>
                    <Field label="Member ID">
                      <TextInput
                        data-testid="profile-public-owner-input"
                        value={publicGalleryOwner}
                        onChange={(e) => setPublicGalleryOwner(e.target.value)}
                      />
                    </Field>
                    <div>
                      <Button
                        type="button"
                        data-testid="profile-public-load-button"
                        disabled={publicGalleryLoading}
                        onClick={() => void loadPublicGallery(publicGalleryOwner)}
                      >
                        {publicGalleryLoading ? "Loading..." : "Load public media"}
                      </Button>
                    </div>
                  </div>
                  {publicMediaAssets.length === 0 ? (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "20px",
                        background: "var(--surface-2)",
                        borderRadius: "var(--radius-md)",
                        textAlign: "center"
                      }}
                    >
                      <p className="muted-text">Approved entries will appear here.</p>
                    </div>
                  ) : (
                    <div
                      className="grid two"
                      data-testid="profile-public-media-grid"
                      style={{ marginTop: "15px" }}
                    >
                      {publicMediaAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="card soft"
                          data-testid="profile-public-media-item"
                          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                          <span className="pill" style={{ alignSelf: "flex-start" }}>
                            {asset.kind}
                          </span>
                          <div style={{ color: "var(--ink)", fontWeight: 600 }}>
                            {formatBytes(asset.fileSizeBytes)}
                          </div>
                          <div className="muted-text" style={{ fontSize: "0.85rem" }}>
                            {formatDate(asset.createdAt)}
                          </div>
                          <a
                            href={asset.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              marginTop: "10px",
                              color: "var(--brand)",
                              fontSize: "0.9rem",
                              fontWeight: 600
                            }}
                          >
                            Open Original File →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Recent Jobs</h3>
                {loading ? <p className="muted-text">Loading activity...</p> : null}
                {!loading && recentJobs.length === 0 ? (
                  <EmptyState title="No recent activity" body="Create a job to view updates here." />
                ) : (
                  <DataTable columns={recentJobsColumns} data={recentJobs} />
                )}
              </Card>

              {avatarCandidates.length === 0 && !profile?.pendingAvatar ? (
                <Card soft>
                  <div className="stack" style={{ gap: "6px" }}>
                    <div style={{ fontWeight: 700 }}>No avatar submissions yet</div>
                    <div className="muted-text">
                      Upload one from the hero section whenever you want to personalize your account.
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
