"use client";

import { formatUiError } from "@illamhelp/shared-types";

import type { CSSProperties } from "react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/LinkButton";

import {
  approvedMedia,
  MediaUploadPanel,
  pendingReviewMedia
} from "@/components/media/MediaUploadPanel";
import { FilePicker } from "@/components/media/FilePicker";
import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  SectionHeader,
  StatusLabel,
  TextInput
} from "@/components/ui/primitives";
import {
  completeMediaUpload,
  createMediaUploadTicket,
  DashboardResponse,
  formatDate,
  getMyDashboard,
  getMyVerification,
  listMyMediaPage,
  listPublicApprovedMediaPage,
  MediaAssetRecord,
  MediaKind,
  PublicMediaAssetRecord,
  ProfileRecord,
  updateMyProfile
} from "@/lib/api";



interface ProfileFormState {
  firstName: string;
  lastName: string;
  city: string;
  area: string;
  serviceCategories: string;
  email: string;
  phone: string;
  alternatePhone: string;
  fullAddress: string;
}

function buildForm(profile: ProfileRecord): ProfileFormState {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName ?? "",
    city: profile.city ?? "",
    area: profile.area ?? "",
    serviceCategories: profile.serviceCategories.join(", "),
    email: profile.contact.email ?? "",
    phone: profile.contact.phone ?? "",
    alternatePhone: profile.contact.alternatePhone ?? "",
    fullAddress: profile.contact.fullAddress ?? ""
  };
}

function parseServiceCategories(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function inferMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

function resolveUploadMedia(file: File): { kind: MediaKind; contentType: string } | null {
  const normalizedType = file.type.trim().toLowerCase();
  const kindFromType = inferMediaKind(normalizedType);
  if (kindFromType) {
    return { kind: kindFromType, contentType: normalizedType };
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(extension)) {
    return { kind: "image", contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}` };
  }
  if (extension && ["mp4", "mov", "m4v", "webm", "quicktime"].includes(extension)) {
    return { kind: "video", contentType: extension === "mov" ? "video/quicktime" : `video/${extension}` };
  }
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Try uploading this file in a different browser.");
  }
  if (file.size < 4 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const CHUNK_SIZE = 2 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    offset += CHUNK_SIZE;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function ProfilePage(): JSX.Element {
  const { accessToken, user } = useSession();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [verified, setVerified] = useState(false);
  const [ownApprovedMedia, setOwnApprovedMedia] = useState<PublicMediaAssetRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePictureUploading, setProfilePictureUploading] = useState(false);
  const [profilePictureError, setProfilePictureError] = useState<string | null>(null);
  const [profilePictureSuccess, setProfilePictureSuccess] = useState<string | null>(null);
  const [pendingProfilePicture, setPendingProfilePicture] = useState<MediaAssetRecord | null>(null);
  
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicMediaCursor, setPublicMediaCursor] = useState<string | null>(null);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const [recentJobs, setRecentJobs] = useState<DashboardResponse["recentJobs"]>([]);

  const profileApprovedMedia = useMemo(
    () => approvedMedia(ownApprovedMedia.filter((asset) => asset.purpose === "profile")),
    [ownApprovedMedia]
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
      if (!accessToken) return;
      const page = await listPublicApprovedMediaPage(normalizedOwnerId, accessToken);
      setPublicMediaAssets(page.items);
      setPublicMediaCursor(page.nextCursor);
    } catch (requestError) {
      setPublicGalleryError(formatUiError(requestError, "Couldn’t load these photos or videos. Check the member ID and your connection."));
      setPublicMediaAssets([]);
      setPublicMediaCursor(null);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, [accessToken]);

  const loadProfileData = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const dashboard = await getMyDashboard(accessToken);
      setRecentJobs(dashboard.recentJobs);
      setProfile(dashboard.profile);
      setForm(buildForm(dashboard.profile));
      setPublicGalleryOwner(dashboard.profile.userId);
      const [mediaPage, publicMediaPage, verification] = await Promise.all([
        listMyMediaPage(accessToken).catch(() => ({ items: [], nextCursor: null })),
        listPublicApprovedMediaPage(dashboard.profile.userId, accessToken).catch(() => ({ items: [], nextCursor: null })),
        getMyVerification(accessToken).catch(() => null)
      ]);
      setMediaAssets(mediaPage.items);
      setMediaCursor(mediaPage.nextCursor);
      setOwnApprovedMedia(publicMediaPage.items);
      setVerified(verification?.status === "approved");
      setPublicMediaAssets(publicMediaPage.items);
      setPublicMediaCursor(publicMediaPage.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load profile analytics");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadMoreMedia = async (): Promise<void> => {
    if (!accessToken || !mediaCursor) return;
    const page = await listMyMediaPage(accessToken, mediaCursor);
    setMediaAssets((previous) => [...previous, ...page.items]);
    setMediaCursor(page.nextCursor);
  };

  const loadMorePublicMedia = async (): Promise<void> => {
    if (!publicMediaCursor) return;
    if (!accessToken) return;
    const page = await listPublicApprovedMediaPage(publicGalleryOwner.trim().toLowerCase(), accessToken, publicMediaCursor);
    setPublicMediaAssets((previous) => [...previous, ...page.items]);
    setPublicMediaCursor(page.nextCursor);
  };

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = Array.from(event.target.files ?? []);
    setUploadFiles((previous) => [...previous, ...selected]);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const clearUploadFile = (): void => {
    setUploadFiles([]);
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUploadFile = (index: number): void => {
    setUploadFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setUploadError(null);
    setUploadSuccess(null);
  };

  const uploadProfileFiles = async (files: File[]): Promise<MediaAssetRecord[]> => {
    if (!accessToken) throw new Error("Sign in before uploading profile media.");
    const invalidFile = files.find((file) => !resolveUploadMedia(file));
    if (invalidFile) {
      throw new Error(`Only professional image/video files are supported. Remove ${invalidFile.name}.`);
    }
    const completedUploads: MediaAssetRecord[] = [];
    for (const file of files) {
      const resolvedMedia = resolveUploadMedia(file);
      if (!resolvedMedia) continue;
      const checksumSha256 = await sha256Hex(file);
      const ticket = await createMediaUploadTicket(
        {
          kind: resolvedMedia.kind,
          purpose: "profile",
          contentType: resolvedMedia.contentType,
          fileSizeBytes: file.size,
          checksumSha256,
          originalFileName: file.name
        },
        accessToken
      );
      const uploadResponse = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.requiredHeaders, body: file });
      if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);
      const etagHeader = uploadResponse.headers.get("etag") ?? undefined;
      const completed = await completeMediaUpload(ticket.mediaId, { etag: etagHeader ? etagHeader.replaceAll('"', "") : undefined }, accessToken);
      completedUploads.push(completed);
    }
    return completedUploads;
  };

  const onUploadMedia = async (): Promise<void> => {
    if (!accessToken) return;
    if (uploadFiles.length === 0) {
      setUploadError("Choose one or more photos or videos to upload.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const completedUploads = await uploadProfileFiles(uploadFiles);
      setMediaAssets((previous) => [
        ...completedUploads,
        ...previous.filter((item) => !completedUploads.some((completed) => completed.id === item.id))
      ]);
      setUploadSuccess(
        `${completedUploads.length} profile ${completedUploads.length === 1 ? "file" : "files"} uploaded for review.`
      );
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (requestError) {
      setUploadError(formatUiError(requestError, "Couldn’t upload your photos or videos. Try uploading again."));
    } finally {
      setUploading(false);
    }
  };

  const onProfilePictureChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null;
    setProfilePictureError(null);
    setProfilePictureSuccess(null);
    if (selected && resolveUploadMedia(selected)?.kind !== "image") {
      setProfilePictureFile(null);
      setProfilePictureError("Choose an image file for your profile picture.");
      return;
    }
    setProfilePictureFile(selected);
  };

  const onUploadProfilePicture = async (): Promise<void> => {
    if (!accessToken) return;
    if (!profilePictureFile) {
      setProfilePictureError("Choose an image to upload as your profile picture.");
      return;
    }
    setProfilePictureUploading(true);
    setProfilePictureError(null);
    setProfilePictureSuccess(null);
    try {
      const completedUploads = await uploadProfileFiles([profilePictureFile]);
      const completedPicture = completedUploads.find((asset) => asset.kind === "image") ?? null;
      setMediaAssets((previous) => [
        ...completedUploads,
        ...previous.filter((item) => !completedUploads.some((completed) => completed.id === item.id))
      ]);
      setPendingProfilePicture(completedPicture);
      setProfilePictureSuccess("Profile picture uploaded for review.");
      setProfilePictureFile(null);
      if (profilePictureInputRef.current) profilePictureInputRef.current.value = "";
    } catch (requestError) {
      setProfilePictureError(formatUiError(requestError, "Couldn’t upload your profile picture. Choose an image and try again."));
    } finally {
      setProfilePictureUploading(false);
    }
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
          serviceCategories: parseServiceCategories(form.serviceCategories),
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
      setError(formatUiError(requestError, "Couldn’t save your changes. Check the details and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Profile"
            title="Your profile"
            subtitle="Edit your profile, add work samples, and manage your contact details."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}

              <div className="card-workspace">
                <div className="stack">
                  <Card as="section" variant="record" className="stack" aria-labelledby="profile-identity-heading">
                  <div className="profile-picture-lockup">
                    <div className="profile-picture-frame">
                      {currentProfilePicture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={currentProfilePicture.downloadUrl} alt="Approved profile picture" />
                      ) : (
                        <span>{(profile?.displayName ?? "I").slice(0, 1).toUpperCase()}</span>
                      )}
                      {pendingProfilePicture || profilePictureFile ? (
                        <em className="profile-picture-state">
                          {profilePictureUploading ? "Uploading" : "Review"}
                        </em>
                      ) : null}
                    </div>
                    <div>
                      <h2 id="profile-identity-heading">{profile?.displayName ?? "Your IllamHelp profile"}</h2>
                    </div>
                  </div>
                  <div className="profile-chip-row">
                    <span data-testid="profile-user-id">Member ID: {profile?.userId ?? user?.publicUserId}</span>
                    <span>{[profile?.city, profile?.area].filter(Boolean).join(", ") || "Location not set"}</span>
                    <span>{profile?.serviceCategories.slice(0, 2).join(", ") || "Services not set"}</span>
                  </div>
                    <div className="card-record-heading">
                      {verified ? <StatusLabel tone="success">Verified profile</StatusLabel> : null}
                      <Link className="button ghost" href="/verification">View verification</Link>
                      <Button type="button" variant="secondary" disabled={!form} aria-expanded={editing} aria-controls={editing ? "profile-editor" : undefined} onClick={() => setEditing((open) => !open)}>
                        {editing ? "Hide profile editor" : "Edit profile"}
                      </Button>
                    </div>
                  </Card>
                <Card variant="action" as="section" aria-labelledby="profile-contact-sharing" className="stack profile-privacy-card">
                  <h3 id="profile-contact-sharing">Contact sharing</h3>
                  <p className="muted-text">See who can view your contact details, review requests, or stop sharing.</p>
                  <div><LinkButton href="/consent" variant="secondary">Manage contact sharing</LinkButton></div>
                </Card>
                {form && editing && (
                <Card id="profile-editor" variant="action" className="stack profile-edit-card">
                  <div className="media-section-title">
                    <div>
                      <h3>Edit profile</h3>
                    </div>
                    <StatusLabel tone="info">Private fields protected</StatusLabel>
                  </div>
                  <form className="grid two" onSubmit={onSave}>
                    <Field label="First name" hint="Required">
                      <TextInput value={form.firstName} onChange={(e) => setForm(prev => prev ? { ...prev, firstName: e.target.value } : prev)} required />
                    </Field>
                    <Field label="Last name">
                      <TextInput value={form.lastName} onChange={(e) => setForm(prev => prev ? { ...prev, lastName: e.target.value } : prev)} />
                    </Field>
                    <Field label="City">
                      <TextInput value={form.city} onChange={(e) => setForm(prev => prev ? { ...prev, city: e.target.value } : prev)} />
                    </Field>
                    <Field label="Area">
                      <TextInput value={form.area} onChange={(e) => setForm(prev => prev ? { ...prev, area: e.target.value } : prev)} />
                    </Field>
                    <Field label="Services you offer" hint="Separate services with commas. For example, plumbing, cleaning.">
                      <TextInput value={form.serviceCategories} onChange={(e) => setForm(prev => prev ? { ...prev, serviceCategories: e.target.value } : prev)} />
                    </Field>
                    <Field label="Email" hint={profile?.contact.emailMasked ? `Masked for others: ${profile.contact.emailMasked}` : "Shared only with connections you approve."}>
                      <TextInput type="email" value={form.email} onChange={(e) => setForm(prev => prev ? { ...prev, email: e.target.value } : prev)} />
                    </Field>
                    <Field label="Phone" hint={profile?.contact.phoneMasked ? `Masked for others: ${profile.contact.phoneMasked}` : "Shared only with connections you approve."}>
                      <TextInput data-testid="profile-phone-input" value={form.phone} onChange={(e) => setForm(prev => prev ? { ...prev, phone: e.target.value } : prev)} />
                    </Field>
                    <Field label="Alternate phone">
                      <TextInput data-testid="profile-alt-phone-input" value={form.alternatePhone} onChange={(e) => setForm(prev => prev ? { ...prev, alternatePhone: e.target.value } : prev)} />
                    </Field>
                    <Field label="Address" hint="Shared only with connections you approve.">
                      <TextInput value={form.fullAddress} onChange={(e) => setForm(prev => prev ? { ...prev, fullAddress: e.target.value } : prev)} />
                    </Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Button type="submit" disabled={saving}>{saving ? "Saving profile" : "Save profile"}</Button>
                    </div>
                  </form>
                </Card>
                )}

                </div>
                <div className="stack">
                  <Card variant="action" className="profile-picture-uploader stack">
                    <div className="media-section-title">
                      <div>
                        <h3>Add a profile picture</h3>
                      </div>
                      <StatusLabel tone={currentProfilePicture ? "success" : "warning"}>
                        {currentProfilePicture ? "Approved" : pendingProfilePicture ? "In review" : "No picture yet"}
                      </StatusLabel>
                    </div>
                    <p className="muted-text">
                      After approval, your profile picture is visible to people who can see your profile media.
                    </p>
                    {profilePictureError ? <Banner tone="error">{profilePictureError}</Banner> : null}
                    {profilePictureSuccess ? <Banner tone="success">{profilePictureSuccess}</Banner> : null}
                    {profilePictureFile ? (
                      <div className="profile-picture-selection">
                        <strong>{profilePictureFile.name}</strong>
                        <span>{Math.round(profilePictureFile.size / 1024)} KB selected</span>
                      </div>
                    ) : null}
                    <div className="media-picker-actions">
                      <FilePicker
                        label="Choose profile picture"
                        inputRef={profilePictureInputRef}
                        accept="image/*"
                        secondary
                        disabled={profilePictureUploading}
                        onChange={onProfilePictureChange}
                      />
                      <Button
                        type="button"
                        disabled={profilePictureUploading || !profilePictureFile}
                        onClick={() => void onUploadProfilePicture()}
                      >
                        {profilePictureUploading ? "Uploading photo…" : "Submit photo for review"}
                      </Button>
                    </div>
                  </Card>
                <Card variant="action" className="media-composer-card stack">
                  <MediaUploadPanel
                    title="Profile photos and videos"
                    description="Show examples of your work. Accepted connections can see them after approval."
                    pickerLabel="Choose photos or videos"
                    uploadLabel="Upload for review"
                    selectedFiles={uploadFiles}
                    inputRef={fileInputRef}
                    pendingItems={pendingReviewMedia(mediaAssets.filter((asset) => asset.purpose === "profile"))}
                    error={uploadError}
                    success={uploadSuccess}
                    uploading={uploading}
                    testId="profile-media-upload"
                    onFileChange={onFileChange}
                    onClearFile={clearUploadFile}
                    onRemoveFile={removeUploadFile}
                    onUpload={() => void onUploadMedia()}
                  />
                  {mediaAssets.length === 0 ? (
                    <EmptyState title="No media uploaded" body="Add images or videos that help others understand your services." />
                  ) : null}
                  {mediaCursor ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <Button type="button" variant="secondary" onClick={() => void loadMoreMedia()}>Load more media</Button>
                    </div>
                  ) : null}
                </Card>

                <Card as="section" variant="record" className="stack" aria-labelledby="profile-gallery-heading">
                  <div className="media-section-title">
                    <div>
                      <h3 id="profile-gallery-heading">Approved photos and videos</h3>
                    </div>
                    <StatusLabel tone="success">{profileApprovedMedia.length} approved</StatusLabel>
                  </div>
                  <MediaPreviewGrid
                    items={profileApprovedMedia}
                    emptyText="Approved profile photos and videos will appear here."
                    testId="profile-approved-media-grid"
                  />
                  <p className="muted-text">Accepted connections can see approved photos and videos. Verification documents stay private.</p>
                </Card>

                </div>
              </div>

              <Card variant="action" className="stack profile-preview-tool">
                <details className="card-disclosure">
                <summary>Preview a member’s approved media</summary>
                <p className="muted-text">Enter a member ID to see approved media you have permission to view.</p>
                {publicGalleryError && <Banner tone="error">{publicGalleryError}</Banner>}
                <div className="grid two" style={{ alignItems: "end" }}>
                  <Field label="Member to preview" hint="Use the ID shown on the member’s profile.">
                    <TextInput data-testid="profile-public-owner-input" value={publicGalleryOwner} onChange={(e) => setPublicGalleryOwner(e.target.value)} />
                  </Field>
                  <div>
                    <Button type="button" data-testid="profile-public-load-button" disabled={publicGalleryLoading} onClick={() => void loadPublicGallery(publicGalleryOwner)}>
                      {publicGalleryLoading ? "Loading media" : "View approved media"}
                    </Button>
                  </div>
                </div>
                <MediaPreviewGrid
                  items={publicMediaAssets.filter((asset) => asset.purpose === "profile")}
                  emptyText="Approved profile photos and videos will appear here."
                  testId="profile-public-media-grid"
                />
                {publicMediaCursor ? (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Button type="button" variant="secondary" onClick={() => void loadMorePublicMedia()}>Show more approved photos and videos</Button>
                  </div>
                ) : null}
                </details>
              </Card>

              <section className="media-section-stack" aria-labelledby="profile-recent-jobs-heading">
                <div className="media-section-title">
                  <div>
                    <p className="surface-label">Recent activity</p>
                    <h3 id="profile-recent-jobs-heading">Recent jobs</h3>
                  </div>
                </div>
                {loading ? <p className="muted-text">Loading activity...</p> : null}
                {!loading && recentJobs.length === 0 ? (
                  <EmptyState title="No recent activity" body="Create a job to view updates here." />
                ) : (
                  <div className="profile-recent-grid">
                    {recentJobs.map((job, index) => (
                      <Link
                        href={`/jobs/${job.id}`}
                        className="profile-recent-card motion-row-change"
                        key={job.id}
                        style={{ "--i": index } as CSSProperties & Record<"--i", number>}
                      >
                        <span>{job.title}</span>
                        <strong>{job.category}</strong>
                        <em>{job.status.replaceAll("_", " ")} · {job.locationText} · {formatDate(job.createdAt).split(",")[0]}</em>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
