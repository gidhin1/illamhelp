"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

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
  TextInput
} from "@/components/ui/primitives";
import {
  completeMediaUpload,
  createMediaUploadTicket,
  DashboardResponse,
  formatDate,
  getMyDashboard,
  listMyMedia,
  listPublicApprovedMedia,
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
  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  return null;
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Your browser does not support file checksum calculation.");
  }

  // For small files (< 4MB), use the simple approach
  if (file.size < 4 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  // For large files, read in chunks to avoid blocking the main thread
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    offset += CHUNK_SIZE;

    // Yield to the main thread between chunks
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Combine chunks and hash
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", combined);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        requestError instanceof Error
          ? requestError.message
          : "Unable to load public media"
      );
      setPublicMediaAssets([]);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, []);

  const loadProfileData = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [dashboard, media] = await Promise.all([
        getMyDashboard(accessToken),
        listMyMedia(accessToken)
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
      setPublicGalleryOwner(dashboard.profile.userId);
      await loadPublicGallery(dashboard.profile.userId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load profile analytics"
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadPublicGallery]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const [recentJobs, setRecentJobs] = useState<DashboardResponse["recentJobs"]>([]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null;
    setUploadFile(selected);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const onUploadMedia = async (): Promise<void> => {
    if (!accessToken) {
      return;
    }
    if (!uploadFile) {
      setUploadError("Choose a photo or video to upload.");
      return;
    }

    const contentType = uploadFile.type.trim().toLowerCase();
    const kind = inferMediaKind(contentType);
    if (!kind) {
      setUploadError("Only professional image/video files are supported.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const checksumSha256 = await sha256Hex(uploadFile);
      const ticket = await createMediaUploadTicket(
        {
          kind,
          contentType,
          fileSizeBytes: uploadFile.size,
          checksumSha256,
          originalFileName: uploadFile.name
        },
        accessToken
      );

      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body: uploadFile
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      const etagHeader = uploadResponse.headers.get("etag") ?? undefined;
      const completed = await completeMediaUpload(
        ticket.mediaId,
        {
          etag: etagHeader ? etagHeader.replaceAll('"', "") : undefined
        },
        accessToken
      );

      setMediaAssets((previous) => [
        completed,
        ...previous.filter((item) => item.id !== completed.id)
      ]);
      setUploadSuccess("Uploaded successfully. Review started.");
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (requestError) {
      setUploadError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to upload media file"
      );
    } finally {
      setUploading(false);
    }
  };

  const onSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !form) {
      return;
    }
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
      setError(
        requestError instanceof Error ? requestError.message : "Unable to update profile"
      );
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
            title="Your account at a glance"
            subtitle="Update your details and control what others can see."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Your jobs</div>
                  <div className="kpi-value">{metrics.totalJobs}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Connections</div>
                  <div className="kpi-value">{metrics.totalConnections}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Active contact shares</div>
                  <div className="kpi-value">{metrics.activeConsentGrants}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Media in review</div>
                  <div className="kpi-value">
                    {
                      mediaAssets.filter((item) =>
                        ["uploaded", "scanning", "ai_reviewed", "human_review_pending"].includes(
                          item.state
                        )
                      ).length
                    }
                  </div>
                </div>
              </div>

              <div className="grid two">
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Identity</h3>
                  <div className="data-row">
                    <div className="data-title">Member ID</div>
                    <div className="data-meta" data-testid="profile-user-id">
                      {profile?.userId ?? user?.publicUserId}
                    </div>
                  </div>
                  <div className="data-row">
                    <div className="data-title">Display name</div>
                    <div className="data-meta">{profile?.displayName ?? "-"}</div>
                  </div>
                  <div className="data-row">
                    <div className="data-title">Account</div>
                    <div className="data-meta">Member</div>
                  </div>
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Safety snapshot</h3>
                  <div className="data-row">
                    <div className="data-title">Pending connections</div>
                    <div className="data-meta">{metrics.pendingConnections}</div>
                  </div>
                  <div className="data-row">
                    <div className="data-title">Contact share requests</div>
                    <div className="data-meta">{metrics.consentRequests}</div>
                  </div>
                  <div className="data-row">
                    <div className="data-title">Photo/video review</div>
                    <div className="data-meta">
                      Only professional work-related media is reviewed for publishing.
                    </div>
                  </div>
                </Card>
              </div>

              {form ? (
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Edit profile</h3>
                  <form className="grid two" onSubmit={onSave}>
                    <Field label="First name">
                      <TextInput
                        value={form.firstName}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, firstName: event.target.value } : previous
                          )
                        }
                        required
                      />
                    </Field>
                    <Field label="Last name">
                      <TextInput
                        value={form.lastName}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, lastName: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <Field label="City">
                      <TextInput
                        value={form.city}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, city: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <Field label="Area">
                      <TextInput
                        value={form.area}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, area: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <Field label="Services offered" hint="Comma-separated: maid, plumber, electrician">
                      <TextInput
                        value={form.serviceCategories}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous
                              ? { ...previous, serviceCategories: event.target.value }
                              : previous
                          )
                        }
                      />
                    </Field>
                    <Field
                      label="Email"
                      hint={
                        profile?.contact.emailMasked
                          ? `Masked for others: ${profile.contact.emailMasked}`
                          : "Add email to share only when you approve."
                      }
                    >
                      <TextInput
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, email: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <Field
                      label="Phone"
                      hint={
                        profile?.contact.phoneMasked
                          ? `Masked for others: ${profile.contact.phoneMasked}`
                          : "Add phone to share only when you approve."
                      }
                    >
                      <TextInput
                        data-testid="profile-phone-input"
                        value={form.phone}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, phone: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <Field label="Alternate phone">
                      <TextInput
                        data-testid="profile-alt-phone-input"
                        value={form.alternatePhone}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous
                              ? { ...previous, alternatePhone: event.target.value }
                              : previous
                          )
                        }
                      />
                    </Field>
                    <Field label="Address">
                      <TextInput
                        value={form.fullAddress}
                        onChange={(event) =>
                          setForm((previous) =>
                            previous ? { ...previous, fullAddress: event.target.value } : previous
                          )
                        }
                      />
                    </Field>
                    <div>
                      <Button type="submit" disabled={saving}>
                        {saving ? "Saving..." : "Save profile"}
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : null}

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Professional media</h3>
                <p className="muted-text">
                  Upload only service-related photos/videos. Each file is reviewed before public
                  display.
                </p>
                {uploadError ? <Banner tone="error">{uploadError}</Banner> : null}
                {uploadSuccess ? <Banner tone="success">{uploadSuccess}</Banner> : null}
                <Field
                  label="Choose file"
                  hint="Allowed: JPEG, PNG, WEBP, MP4, MOV, WEBM. Keep content strictly work-related."
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    onChange={onFileChange}
                  />
                </Field>
                {uploadFile ? (
                  <div className="data-row">
                    <div className="data-title">{uploadFile.name}</div>
                    <div className="data-meta">{formatBytes(uploadFile.size)}</div>
                  </div>
                ) : null}
                <div>
                  <Button type="button" disabled={uploading} onClick={() => void onUploadMedia()}>
                    {uploading ? "Uploading..." : "Upload for review"}
                  </Button>
                </div>
                {mediaAssets.length === 0 ? (
                  <EmptyState
                    title="No media uploaded"
                    body="Your photos/videos will appear here after upload."
                  />
                ) : (
                  <div className="grid two">
                    {mediaAssets.slice(0, 8).map((asset) => (
                      <div key={asset.id} className="data-row">
                        <div className="pill">{asset.kind}</div>
                        <div className="data-title">{asset.objectKey.split("/").at(-1)}</div>
                        <div className="data-meta">State: {asset.state.replaceAll("_", " ")}</div>
                        <div className="data-meta">{formatBytes(asset.fileSizeBytes)}</div>
                        <div className="field-hint">{formatDate(asset.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Public gallery preview</h3>
                <p className="muted-text">
                  This is what others can view publicly. Only approved files appear here.
                </p>
                {publicGalleryError ? <Banner tone="error">{publicGalleryError}</Banner> : null}
                <div className="grid two">
                  <Field label="Member ID">
                    <TextInput
                      data-testid="profile-public-owner-input"
                      value={publicGalleryOwner}
                      onChange={(event) => setPublicGalleryOwner(event.target.value)}
                    />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <Button
                      type="button"
                      data-testid="profile-public-load-button"
                      disabled={publicGalleryLoading}
                      onClick={() => void loadPublicGallery(publicGalleryOwner)}
                    >
                      {publicGalleryLoading ? "Loading..." : "Load approved media"}
                    </Button>
                  </div>
                </div>
                {publicMediaAssets.length === 0 ? (
                  <EmptyState
                    title="No approved media yet"
                    body="Approved files will appear here once moderation is complete."
                  />
                ) : (
                  <div className="grid two" data-testid="profile-public-media-grid">
                    {publicMediaAssets.map((asset) => (
                      <div key={asset.id} className="data-row" data-testid="profile-public-media-item">
                        <div className="pill">{asset.kind}</div>
                        <div className="data-meta">{formatBytes(asset.fileSizeBytes)}</div>
                        <div className="field-hint">{formatDate(asset.createdAt)}</div>
                        <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                          Open approved file
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Recent jobs</h3>
                {loading ? <p className="muted-text">Loading activity...</p> : null}
                {!loading && recentJobs.length === 0 ? (
                  <EmptyState
                    title="No jobs recorded"
                    body="Create a job in the Jobs page to see activity here."
                  />
                ) : null}
                {!loading ? (
                  <div className="grid three">
                    {recentJobs.map((job) => (
                      <div key={job.id} className="data-row">
                        <div className="pill">{job.status}</div>
                        <div className="data-title">{job.title}</div>
                        <div className="data-meta">{job.category}</div>
                        <div className="data-meta">{job.locationText}</div>
                        <div className="field-hint">{formatDate(job.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
