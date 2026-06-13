"use client";

import type { CSSProperties } from "react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import Link from "next/link";

import {
  approvedMedia,
  MediaUploadPanel,
  pendingReviewMedia
} from "@/components/media/MediaUploadPanel";
import { MediaPreviewGrid } from "@/components/media/MediaPreviewGrid";
import { PageShell } from "@/components/PageShell";
import { PersonSummary } from "@/components/PersonSummary";
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
  listMyMediaPage,
  listPublicApprovedMediaPage,
  MediaAssetRecord,
  MediaKind,
  PublicMediaAssetRecord,
  ProfileRecord,
  updateMyProfile
} from "@/lib/api";

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

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Browser does not support file checksums.");
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
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicMediaCursor, setPublicMediaCursor] = useState<string | null>(null);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [recentJobs, setRecentJobs] = useState<DashboardResponse["recentJobs"]>([]);

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
      setPublicGalleryError(requestError instanceof Error ? requestError.message : "Unable to load public media");
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
      setPublicGalleryOwner(dashboard.profile.userId);
      const [mediaPage, publicMediaPage] = await Promise.all([
        listMyMediaPage(accessToken).catch(() => ({ items: [], nextCursor: null })),
        listPublicApprovedMediaPage(dashboard.profile.userId, accessToken).catch(() => ({ items: [], nextCursor: null }))
      ]);
      setMediaAssets(mediaPage.items);
      setMediaCursor(mediaPage.nextCursor);
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
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const removeUploadFile = (index: number): void => {
    setUploadFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setUploadError(null);
    setUploadSuccess(null);
  };

  const onUploadMedia = async (): Promise<void> => {
    if (!accessToken) return;
    if (uploadFiles.length === 0) {
      setUploadError("Choose one or more photos or videos to upload.");
      return;
    }
    const invalidFile = uploadFiles.find((file) => !inferMediaKind(file.type.trim().toLowerCase()));
    if (invalidFile) {
      setUploadError(`Only professional image/video files are supported. Remove ${invalidFile.name}.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const completedUploads: MediaAssetRecord[] = [];
      for (const file of uploadFiles) {
        const contentType = file.type.trim().toLowerCase();
        const kind = inferMediaKind(contentType);
        if (!kind) continue;
        const checksumSha256 = await sha256Hex(file);
        const ticket = await createMediaUploadTicket(
          { kind, purpose: "profile", contentType, fileSizeBytes: file.size, checksumSha256, originalFileName: file.name },
          accessToken
        );
        const uploadResponse = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.requiredHeaders, body: file });
        if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);
        const etagHeader = uploadResponse.headers.get("etag") ?? undefined;
        const completed = await completeMediaUpload(ticket.mediaId, { etag: etagHeader ? etagHeader.replaceAll('"', "") : undefined }, accessToken);
        completedUploads.push(completed);
      }
      setMediaAssets((previous) => [
        ...completedUploads,
        ...previous.filter((item) => !completedUploads.some((completed) => completed.id === item.id))
      ]);
      setUploadSuccess(
        `${completedUploads.length} profile ${completedUploads.length === 1 ? "file" : "files"} uploaded for review.`
      );
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (requestError) {
      setUploadError(requestError instanceof Error ? requestError.message : "Unable to upload media file");
    } finally {
      setUploading(false);
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
      setError(requestError instanceof Error ? requestError.message : "Unable to update profile");
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
            title="Your public trust page"
            subtitle="Lead with your identity, show approved work media, and keep private contact details protected."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}

              <div className="profile-story-layout">
                <section className="profile-identity-panel" aria-labelledby="profile-identity-heading">
                  <p className="surface-label">Human identity</p>
                  <h2 id="profile-identity-heading">{profile?.displayName ?? "Your IllamHelp profile"}</h2>
                  {profile ? <PersonSummary userId={profile.userId} profile={profile} /> : null}
                  <div className="profile-chip-row">
                    <span data-testid="profile-user-id">Member ID: {profile?.userId ?? user?.publicUserId}</span>
                    <span>{profile?.city || "City not set"}</span>
                    <span>{profile?.serviceCategories.slice(0, 2).join(", ") || "Services not set"}</span>
                  </div>
                  <div className="media-hero-stats" aria-label="Profile summary">
                    <div>
                      <strong>{metrics.totalJobs}</strong>
                      <span>Jobs</span>
                    </div>
                    <div>
                      <strong>{metrics.totalConnections}</strong>
                      <span>People</span>
                    </div>
                    <div>
                      <strong>{metrics.activeConsentGrants}</strong>
                      <span>Shares</span>
                    </div>
                  </div>
                </section>

                <section className="profile-gallery-panel" aria-labelledby="profile-gallery-heading">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Privacy state</p>
                      <h3 id="profile-gallery-heading">Approved profile gallery</h3>
                    </div>
                    <StatusLabel tone="success">{approvedMedia(publicMediaAssets.filter((asset) => asset.purpose === "profile")).length} approved</StatusLabel>
                  </div>
                  <MediaPreviewGrid
                    items={approvedMedia(publicMediaAssets.filter((asset) => asset.purpose === "profile"))}
                    emptyText="Approved profile photos and videos will appear here."
                    testId="profile-approved-media-grid"
                  />
                  <p className="muted-text">Accepted connections can view approved profile photos and videos. Verification documents never appear here.</p>
                </section>
              </div>

              <section className="media-section-stack" aria-labelledby="profile-media-upload-heading">
                <Card className="media-composer-card stack">
                  <MediaUploadPanel
                    title="Profile photos and videos"
                    description="Add work examples and service proof. New media is reviewed before it appears to connections."
                    pickerLabel="Add profile media"
                    cameraLabel="Take profile media"
                    uploadLabel="Upload profile media"
                    selectedFiles={uploadFiles}
                    inputRef={fileInputRef}
                    cameraInputRef={cameraInputRef}
                    pendingItems={pendingReviewMedia(mediaAssets.filter((asset) => asset.purpose === "profile"))}
                    error={uploadError}
                    success={uploadSuccess}
                    uploading={uploading}
                    testId="profile-media-upload"
                    onFileChange={onFileChange}
                    onCameraFileChange={onFileChange}
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
              </section>

              <div className="profile-action-grid">
                {form && (
                <Card className="stack profile-edit-card">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Next safe action</p>
                      <h3>Update profile details</h3>
                    </div>
                    <StatusLabel tone="info">Private fields protected</StatusLabel>
                  </div>
                  <form className="grid two" onSubmit={onSave}>
                    <Field label="First Name" hint="Required">
                      <TextInput value={form.firstName} onChange={(e) => setForm(prev => prev ? { ...prev, firstName: e.target.value } : prev)} required />
                    </Field>
                    <Field label="Last Name">
                      <TextInput value={form.lastName} onChange={(e) => setForm(prev => prev ? { ...prev, lastName: e.target.value } : prev)} />
                    </Field>
                    <Field label="City">
                      <TextInput value={form.city} onChange={(e) => setForm(prev => prev ? { ...prev, city: e.target.value } : prev)} />
                    </Field>
                    <Field label="Area">
                      <TextInput value={form.area} onChange={(e) => setForm(prev => prev ? { ...prev, area: e.target.value } : prev)} />
                    </Field>
                    <Field label="Services Offered" hint="Comma-separated: maid, plumber, electrician">
                      <TextInput value={form.serviceCategories} onChange={(e) => setForm(prev => prev ? { ...prev, serviceCategories: e.target.value } : prev)} />
                    </Field>
                    <Field label="Email" hint={profile?.contact.emailMasked ? `Masked for others: ${profile.contact.emailMasked}` : "Private email address."}>
                      <TextInput type="email" value={form.email} onChange={(e) => setForm(prev => prev ? { ...prev, email: e.target.value } : prev)} />
                    </Field>
                    <Field label="Phone" hint={profile?.contact.phoneMasked ? `Masked for others: ${profile.contact.phoneMasked}` : "Private primary phone."}>
                      <TextInput data-testid="profile-phone-input" value={form.phone} onChange={(e) => setForm(prev => prev ? { ...prev, phone: e.target.value } : prev)} />
                    </Field>
                    <Field label="Alt Phone">
                      <TextInput data-testid="profile-alt-phone-input" value={form.alternatePhone} onChange={(e) => setForm(prev => prev ? { ...prev, alternatePhone: e.target.value } : prev)} />
                    </Field>
                    <Field label="Address" hint="Never exposed without explicit consent.">
                      <TextInput value={form.fullAddress} onChange={(e) => setForm(prev => prev ? { ...prev, fullAddress: e.target.value } : prev)} />
                    </Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Button type="submit" disabled={saving}>{saving ? "Saving profile" : "Save profile"}</Button>
                    </div>
                  </form>
                </Card>
                )}

                <Card className="stack profile-privacy-card">
                  <div className="media-section-title">
                    <div>
                      <p className="surface-label">Contact privacy</p>
                      <h3>Safety defaults</h3>
                    </div>
                    <StatusLabel tone="success">Protected</StatusLabel>
                  </div>
                  <p className="muted-text">
                    Contact information is hidden from the public. Approved mutual connections can view only what you explicitly share.
                  </p>
                  <div className="profile-chip-row">
                    <span>{metrics.pendingConnections} pending people</span>
                    <span>{metrics.consentRequests} contact requests</span>
                    <span>{metrics.activeConsentGrants} active shares</span>
                  </div>
                  <Link href="/consent" className="button ghost">Manage contact sharing</Link>
                </Card>
              </div>

              <Card className="stack profile-preview-tool">
                <div className="media-section-title">
                  <div>
                    <p className="surface-label">Preview tool</p>
                    <h3>Approved profile preview</h3>
                  </div>
                </div>
                <p className="muted-text">Load another member profile gallery when you need to inspect approved media from a connection context.</p>
                {publicGalleryError && <Banner tone="error">{publicGalleryError}</Banner>}
                <div className="grid two" style={{ alignItems: "end" }}>
                  <Field label="Member to preview" hint="Use a public member ID when you need to inspect another profile gallery.">
                    <TextInput data-testid="profile-public-owner-input" value={publicGalleryOwner} onChange={(e) => setPublicGalleryOwner(e.target.value)} />
                  </Field>
                  <div>
                    <Button type="button" data-testid="profile-public-load-button" disabled={publicGalleryLoading} onClick={() => void loadPublicGallery(publicGalleryOwner)}>
                      {publicGalleryLoading ? "Loading media" : "Load public media"}
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
                    <Button type="button" variant="secondary" onClick={() => void loadMorePublicMedia()}>Load more approved media</Button>
                  </div>
                ) : null}
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
