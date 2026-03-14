"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
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
      const assets = await listPublicApprovedMedia(normalizedOwnerId);
      setPublicMediaAssets(assets);
    } catch (requestError) {
      setPublicGalleryError(requestError instanceof Error ? requestError.message : "Unable to load public media");
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
      setError(requestError instanceof Error ? requestError.message : "Unable to load profile analytics");
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadPublicGallery]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null;
    setUploadFile(selected);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const onUploadMedia = async (): Promise<void> => {
    if (!accessToken) return;
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
        { kind, contentType, fileSizeBytes: uploadFile.size, checksumSha256, originalFileName: uploadFile.name },
        accessToken
      );
      const uploadResponse = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.requiredHeaders, body: uploadFile });
      if (!uploadResponse.ok) throw new Error(`Upload failed with status ${uploadResponse.status}`);
      const etagHeader = uploadResponse.headers.get("etag") ?? undefined;
      const completed = await completeMediaUpload(ticket.mediaId, { etag: etagHeader ? etagHeader.replaceAll('"', "") : undefined }, accessToken);
      setMediaAssets((previous) => [completed, ...previous.filter((item) => item.id !== completed.id)]);
      setUploadSuccess("Uploaded successfully. Review started.");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const mediaColumns: ColumnDef<MediaAssetRecord>[] = [
    {
      accessorKey: "kind",
      header: "Type",
      cell: ({ row }) => <span className="pill" style={{ textTransform: "capitalize" }}>{row.original.kind}</span>
    },
    {
      accessorKey: "objectKey",
      header: "Filename",
      cell: ({ row }) => {
        const parts = row.original.objectKey.split("/");
        return <span style={{ fontWeight: 600, color: "var(--ink)" }}>{parts.at(-1) ?? "unknown"}</span>;
      }
    },
    {
      accessorKey: "state",
      header: "Status",
      cell: ({ row }) => <span className="pill" style={{ background: "var(--surface-2)" }}>{row.original.state.replaceAll("_", " ")}</span>
    },
    {
      accessorKey: "fileSizeBytes",
      header: "Size",
      cell: ({ row }) => <span className="muted-text">{formatBytes(row.original.fileSizeBytes)}</span>
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => <span className="muted-text">{formatDate(row.original.createdAt).split(",")[0]}</span>
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
      header: "Category",
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
      cell: ({ row }) => <span className="muted-text">{formatDate(row.original.createdAt).split(",")[0]}</span>
    }
  ];

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Profile"
            title="Manage Your Settings"
            subtitle="Update identity details, review metrics, and control contact sharing."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {saveMessage ? <Banner tone="success">{saveMessage}</Banner> : null}
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Your Jobs</div>
                  <div className="kpi-value">{metrics.totalJobs}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Connections</div>
                  <div className="kpi-value">{metrics.totalConnections}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Active Shares</div>
                  <div className="kpi-value">{metrics.activeConsentGrants}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Media in Review</div>
                  <div className="kpi-value">
                    {mediaAssets.filter((item) => ["uploaded", "scanning", "ai_reviewed", "human_review_pending"].includes(item.state)).length}
                  </div>
                </div>
              </div>

              <div className="grid two" style={{ alignItems: "start" }}>
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Identity Snapshot</h3>
                  <div className="data-row">
                    <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Member ID</div>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem" }} data-testid="profile-user-id">
                      {profile?.userId ?? user?.publicUserId}
                    </div>
                  </div>
                  <div className="data-row">
                    <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Display Name</div>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{profile?.displayName ?? "-"}</div>
                  </div>
                </Card>

                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)" }}>Safety Defaults</h3>
                  <p className="muted-text" style={{ fontSize: "0.95rem" }}>
                    Your contact information is permanently hidden from the public. Only approved mutual connections can securely view the details below.
                  </p>
                  <div className="data-row" style={{ marginTop: "10px" }}>
                    <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Pending Conns</div>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{metrics.pendingConnections}</div>
                  </div>
                  <div className="data-row">
                    <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase" }}>Contact Requests</div>
                    <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{metrics.consentRequests}</div>
                  </div>
                  <div style={{ marginTop: "10px" }}>
                    <Link href="/consent" className="button-link">
                      <Button variant="ghost">Manage details sharing →</Button>
                    </Link>
                  </div>
                </Card>
              </div>

              {form && (
                <Card className="stack">
                  <h3 style={{ fontFamily: "var(--font-display)", marginBottom: "var(--spacing-md)" }}>Personal Info</h3>
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
                      <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Profile"}</Button>
                    </div>
                  </form>
                </Card>
              )}

              <Card className="stack">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "15px" }}>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display)" }}>Professional Media</h3>
                    <p className="muted-text">Upload photos/videos of your work. Content is strictly reviewed.</p>
                  </div>
                  <div>
                    {uploadError && <Banner tone="error">{uploadError}</Banner>}
                    {uploadSuccess && <Banner tone="success">{uploadSuccess}</Banner>}
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={onFileChange} style={{ maxWidth: 220 }} />
                      <Button type="button" disabled={uploading} onClick={() => void onUploadMedia()}>{uploading ? "Uploading..." : "Upload"}</Button>
                    </div>
                  </div>
                </div>
                
                {mediaAssets.length === 0 ? (
                  <EmptyState title="No media uploaded" body="Your professional verification and work photos will appear here." />
                ) : (
                  <DataTable columns={mediaColumns} data={mediaAssets} />
                )}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Public Gallery Previews</h3>
                <p className="muted-text">Preview approved public files. Enter member ID below.</p>
                {publicGalleryError && <Banner tone="error">{publicGalleryError}</Banner>}
                <div className="grid two" style={{ alignItems: "end" }}>
                  <Field label="Member ID">
                    <TextInput data-testid="profile-public-owner-input" value={publicGalleryOwner} onChange={(e) => setPublicGalleryOwner(e.target.value)} />
                  </Field>
                  <div>
                    <Button type="button" data-testid="profile-public-load-button" disabled={publicGalleryLoading} onClick={() => void loadPublicGallery(publicGalleryOwner)}>
                      {publicGalleryLoading ? "Loading..." : "Load public media"}
                    </Button>
                  </div>
                </div>
                {publicMediaAssets.length === 0 ? (
                  <div style={{ marginTop: "10px", padding: "20px", background: "var(--surface-2)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                    <p className="muted-text">Approved entries will appear here.</p>
                  </div>
                ) : (
                  <div className="grid two" data-testid="profile-public-media-grid" style={{ marginTop: "15px" }}>
                    {publicMediaAssets.map((asset) => (
                      <div key={asset.id} className="card soft" data-testid="profile-public-media-item" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span className="pill" style={{ alignSelf: "flex-start" }}>{asset.kind}</span>
                        <div style={{ color: "var(--ink)", fontWeight: 600 }}>{formatBytes(asset.fileSizeBytes)}</div>
                        <div className="muted-text" style={{ fontSize: "0.85rem" }}>{formatDate(asset.createdAt)}</div>
                        <a href={asset.downloadUrl} target="_blank" rel="noreferrer" style={{ marginTop: "10px", color: "var(--brand)", fontSize: "0.9rem", fontWeight: 600 }}>
                          Open Original File →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="stack">
                <h3 style={{ fontFamily: "var(--font-display)" }}>Recent Jobs</h3>
                {loading ? <p className="muted-text">Loading activity...</p> : null}
                {!loading && recentJobs.length === 0 ? (
                  <EmptyState title="No recent activity" body="Create a job to view updates here." />
                ) : (
                  <DataTable columns={recentJobsColumns} data={recentJobs} />
                )}
              </Card>
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
