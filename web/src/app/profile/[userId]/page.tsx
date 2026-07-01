"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { approvedMedia } from "@/components/media/MediaUploadPanel";
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
  SectionHeader,
  Skeleton,
  StatusLabel
} from "@/components/ui/primitives";
import {
  getProfileByUserId,
  listPublicApprovedMediaPage,
  ProfileRecord,
  PublicMediaAssetRecord,
  requestConnection
} from "@/lib/api";

function routeUserId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function profileLocation(profile: ProfileRecord): string {
  return [profile.city, profile.area].filter(Boolean).join(", ") || "Location not shared";
}

export default function PublicProfilePage(): JSX.Element {
  const params = useParams<{ userId: string }>();
  const targetUserId = routeUserId(params.userId);
  const { accessToken, user } = useSession();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [mediaAssets, setMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const profileMedia = useMemo(
    () => approvedMedia(mediaAssets.filter((asset) => asset.purpose === "profile")),
    [mediaAssets]
  );
  const profilePicture = profileMedia.find((asset) => asset.kind === "image") ?? profileMedia[0] ?? null;
  const isOwnProfile = user?.publicUserId === targetUserId;

  const loadProfile = useCallback(async (): Promise<void> => {
    if (!accessToken || !targetUserId) return;
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
      setError(requestError instanceof Error ? requestError.message : "Unable to load this profile");
      setProfile(null);
      setMediaAssets([]);
      setMediaCursor(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, targetUserId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadMoreMedia = async (): Promise<void> => {
    if (!accessToken || !mediaCursor || !targetUserId) return;
    const page = await listPublicApprovedMediaPage(targetUserId, accessToken, mediaCursor);
    setMediaAssets((previous) => [...previous, ...page.items]);
    setMediaCursor(page.nextCursor);
  };

  const onRequestConnection = async (): Promise<void> => {
    if (!accessToken || !targetUserId) return;
    setRequestLoading(true);
    setRequestMessage(null);
    setError(null);
    try {
      await requestConnection({ targetUserId }, accessToken);
      setRequestMessage("Connection request sent.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send connection request");
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container stack">
          <SectionHeader
            eyebrow="Profile"
            title={profile?.displayName ?? "Member profile"}
            subtitle="Only the details and media allowed by this person's privacy settings are shown here."
          />
          <RequireSession>
            <div className="stack">
              {error ? <Banner tone="error">{error}</Banner> : null}
              {requestMessage ? <Banner tone="success">{requestMessage}</Banner> : null}
              {loading ? <Skeleton lines={4} /> : null}

              {!loading && !profile ? (
                <EmptyState
                  title="Profile unavailable"
                  body="This profile may be private, blocked, or unavailable to your account."
                />
              ) : null}

              {profile ? (
                <>
                  <div className="profile-story-layout">
                    <section className="profile-identity-panel" aria-labelledby="public-profile-identity-heading">
                      <p className="surface-label">Human identity</p>
                      <div className="profile-picture-lockup">
                        <div className="profile-picture-frame">
                          {profilePicture?.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profilePicture.downloadUrl} alt={`${profile.displayName} profile media`} />
                          ) : (
                            <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <h2 id="public-profile-identity-heading">{profile.displayName}</h2>
                          <PersonSummary userId={profile.userId} profile={profile} />
                        </div>
                      </div>
                      <div className="profile-chip-row">
                        <span>Member ID: {profile.userId}</span>
                        <span>{profileLocation(profile)}</span>
                        <span>{profile.serviceCategories.slice(0, 2).join(", ") || "Services not shared"}</span>
                      </div>
                    </section>

                    <section className="profile-gallery-panel" aria-labelledby="public-profile-gallery-heading">
                      <div className="media-section-title">
                        <div>
                          <p className="surface-label">Privacy state</p>
                          <h3 id="public-profile-gallery-heading">Visible profile media</h3>
                        </div>
                        <StatusLabel tone={profileMedia.length > 0 ? "success" : "neutral"}>
                          {profileMedia.length} visible
                        </StatusLabel>
                      </div>
                      <MediaPreviewGrid
                        items={profileMedia}
                        emptyText="No approved profile photos or videos are visible to you."
                        testId="discovered-profile-media-grid"
                      />
                      {mediaCursor ? (
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <Button type="button" variant="secondary" onClick={() => void loadMoreMedia()}>
                            Load more media
                          </Button>
                        </div>
                      ) : null}
                    </section>
                  </div>

                  <div className="profile-action-grid">
                    <Card className="stack profile-privacy-card">
                      <div className="media-section-title">
                        <div>
                          <p className="surface-label">Contact privacy</p>
                          <h3>Shared details</h3>
                        </div>
                        <StatusLabel tone="info">Privacy filtered</StatusLabel>
                      </div>
                      <div className="profile-detail-list">
                        <span>Email: {profile.contact.email ?? profile.contact.emailMasked ?? "Not shared"}</span>
                        <span>Phone: {profile.contact.phone ?? profile.contact.phoneMasked ?? "Not shared"}</span>
                        <span>Address: {profile.contact.fullAddress ?? "Not shared"}</span>
                        <span>Rating: {profile.ratingAverage ? `${profile.ratingAverage.toFixed(1)} (${profile.ratingCount})` : "No rating yet"}</span>
                      </div>
                    </Card>

                    <Card className="stack profile-privacy-card">
                      <div className="media-section-title">
                        <div>
                          <p className="surface-label">Next safe action</p>
                          <h3>{isOwnProfile ? "Manage your profile" : "Build trust gradually"}</h3>
                        </div>
                      </div>
                      <p className="muted-text">
                        {isOwnProfile
                          ? "Update your own profile media and contact details from your profile workspace."
                          : "Send a connection request before asking for private contact details."}
                      </p>
                      {isOwnProfile ? (
                        <Link className="button" href="/profile">Edit my profile</Link>
                      ) : (
                        <Button type="button" disabled={requestLoading} onClick={() => void onRequestConnection()}>
                          {requestLoading ? "Sending request" : "Send connection request"}
                        </Button>
                      )}
                    </Card>
                  </div>
                </>
              ) : null}
            </div>
          </RequireSession>
        </div>
      </section>
    </PageShell>
  );
}
