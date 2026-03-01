import { Platform } from "react-native";

export type UserType = "seeker" | "provider" | "both";
export type AppRole = "both" | "seeker" | "provider" | "admin" | "support";
export type ConsentField = "phone" | "alternate_phone" | "email" | "full_address";

export const CONSENT_FIELDS: ConsentField[] = [
  "phone",
  "alternate_phone",
  "email",
  "full_address"
];

export interface ApiErrorPayload {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export interface AuthSessionResponse {
  userId: string;
  publicUserId: string;
  username: string;
  userType: UserType;
  roles: AppRole[];
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  tokenType: string;
  scope?: string;
}

export interface AuthenticatedUser {
  userId: string;
  publicUserId: string;
  roles: AppRole[];
  userType: UserType;
  tokenSubject: string;
}

export interface JobRecord {
  id: string;
  seekerUserId: string;
  category: string;
  title: string;
  description: string;
  locationText: string;
  visibility: "public" | "connections_only";
  status:
    | "posted"
    | "accepted"
    | "in_progress"
    | "completed"
    | "payment_done"
    | "payment_received"
    | "closed"
    | "cancelled";
  assignedProviderUserId: string | null;
  acceptedApplicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobApplicationRecord {
  id: string;
  jobId: string;
  providerUserId: string;
  status: "applied" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionRecord {
  id: string;
  userAId: string;
  userBId: string;
  requestedByUserId: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  requestedAt: string;
  decidedAt: string | null;
}

export interface ConnectionSearchCandidate {
  userId: string;
  displayName: string;
  locationLabel: string | null;
  serviceCategories: string[];
  recentJobCategories: string[];
  recentLocations: string[];
}

export interface ProfileRecord {
  userId: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  city: string | null;
  area: string | null;
  serviceCategories: string[];
  ratingAverage: number | null;
  ratingCount: number;
  contact: {
    email: string | null;
    phone: string | null;
    alternatePhone: string | null;
    fullAddress: string | null;
    emailMasked: string | null;
    phoneMasked: string | null;
  };
  visibility: {
    email: boolean;
    phone: boolean;
    alternatePhone: boolean;
    fullAddress: boolean;
  };
}

export interface AccessRequestRecord {
  id: string;
  requesterUserId: string;
  ownerUserId: string;
  connectionId: string;
  requestedFields: ConsentField[];
  purpose: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
}

export interface ConsentGrantRecord {
  id: string;
  accessRequestId: string | null;
  ownerUserId: string;
  granteeUserId: string;
  connectionId: string;
  grantedFields: ConsentField[];
  purpose: string;
  status: "active" | "revoked";
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export type MediaKind = "image" | "video";

export interface MediaAssetRecord {
  id: string;
  ownerUserId: string;
  jobId: string | null;
  kind: MediaKind;
  bucketName: string;
  objectKey: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  state:
    | "uploaded"
    | "scanning"
    | "ai_reviewed"
    | "human_review_pending"
    | "approved"
    | "rejected"
    | "appeal_pending"
    | "appeal_resolved";
  createdAt: string;
  updatedAt: string;
}

export interface UploadTicketRecord {
  mediaId: string;
  bucketName: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface PublicMediaAssetRecord {
  id: string;
  ownerUserId: string;
  jobId: string | null;
  kind: MediaKind;
  contentType: string;
  fileSizeBytes: number;
  state: "approved";
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
}

function defaultApiBaseUrl(): string {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000/api/v1";
  }
  return "http://localhost:4000/api/v1";
}

export const API_BASE_URL =
  (
    globalThis as unknown as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? defaultApiBaseUrl();

const API_TIMEOUT_MS = Number(
  (
    globalThis as unknown as {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.EXPO_PUBLIC_API_TIMEOUT_MS ?? "15000"
);

function asErrorMessage(payload: ApiErrorPayload | undefined, fallback: string): string {
  if (!payload) {
    return fallback;
  }
  if (Array.isArray(payload.message)) {
    return payload.message.join(", ");
  }
  if (typeof payload.message === "string" && payload.message.length > 0) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.length > 0) {
    return payload.error;
  }
  return fallback;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const abortController = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timeoutId =
    abortController && Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0
      ? setTimeout(() => abortController.abort(), API_TIMEOUT_MS)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: abortController?.signal
    });
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS}ms (${path})`);
    }
    if (error instanceof Error && error.message) {
      throw new Error(`${error.message} (${path})`);
    }
    throw new Error(`Network request failed (${path})`);
  }

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = undefined;
    }
    throw new Error(asErrorMessage(payload, `Request failed with ${response.status} (${path})`));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function register(payload: {
  username?: string;
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: {
  username: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function authMe(accessToken: string): Promise<AuthenticatedUser> {
  return apiRequest<AuthenticatedUser>("/auth/me", {}, accessToken);
}

export function listJobs(accessToken: string): Promise<JobRecord[]> {
  return apiRequest<
    JobRecord[] | { items?: JobRecord[]; total?: number; limit?: number; offset?: number }
  >("/jobs", {}, accessToken).then((payload) => {
    if (Array.isArray(payload)) {
      return payload;
    }
    return payload.items ?? [];
  });
}

export function createJob(
  payload: {
    category: string;
    title: string;
    description: string;
    locationText: string;
    visibility: "public" | "connections_only";
  },
  accessToken: string
): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    "/jobs",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function applyToJob(
  jobId: string,
  payload: { message?: string },
  accessToken: string
): Promise<JobApplicationRecord> {
  return apiRequest<JobApplicationRecord>(
    `/jobs/${jobId}/apply`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function listJobApplications(
  jobId: string,
  accessToken: string
): Promise<JobApplicationRecord[]> {
  return apiRequest<JobApplicationRecord[]>(`/jobs/${jobId}/applications`, {}, accessToken);
}

export function listMyJobApplications(accessToken: string): Promise<JobApplicationRecord[]> {
  return apiRequest<JobApplicationRecord[]>("/jobs/applications/mine", {}, accessToken);
}

export function acceptJobApplication(
  applicationId: string,
  accessToken: string
): Promise<JobApplicationRecord> {
  return apiRequest<JobApplicationRecord>(
    `/jobs/applications/${applicationId}/accept`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function rejectJobApplication(
  applicationId: string,
  payload: { reason?: string },
  accessToken: string
): Promise<JobApplicationRecord> {
  return apiRequest<JobApplicationRecord>(
    `/jobs/applications/${applicationId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function withdrawJobApplication(
  applicationId: string,
  accessToken: string
): Promise<JobApplicationRecord> {
  return apiRequest<JobApplicationRecord>(
    `/jobs/applications/${applicationId}/withdraw`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function startBooking(jobId: string, accessToken: string): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/start`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function completeBooking(jobId: string, accessToken: string): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/complete`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function markPaymentDone(jobId: string, accessToken: string): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/payment-done`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function markPaymentReceived(jobId: string, accessToken: string): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/payment-received`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function closeBooking(jobId: string, accessToken: string): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/close`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function cancelBooking(
  jobId: string,
  payload: { reason?: string },
  accessToken: string
): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function listConnections(accessToken: string): Promise<ConnectionRecord[]> {
  return apiRequest<ConnectionRecord[]>("/connections", {}, accessToken);
}

export function requestConnection(
  payload: { targetUserId?: string; targetQuery?: string },
  accessToken: string
): Promise<ConnectionRecord> {
  return apiRequest<ConnectionRecord>(
    "/connections/request",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function searchConnections(
  payload: { q?: string; limit?: number },
  accessToken: string
): Promise<ConnectionSearchCandidate[]> {
  const params = new URLSearchParams();
  if (payload.q && payload.q.trim().length > 0) {
    params.set("q", payload.q.trim());
  }
  if (typeof payload.limit === "number") {
    params.set("limit", String(payload.limit));
  }
  const queryString = params.toString();
  const path = queryString ? `/connections/search?${queryString}` : "/connections/search";
  return apiRequest<ConnectionSearchCandidate[]>(path, {}, accessToken);
}

export function acceptConnection(
  connectionId: string,
  accessToken: string
): Promise<ConnectionRecord> {
  return apiRequest<ConnectionRecord>(
    `/connections/${connectionId}/accept`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function declineConnection(
  connectionId: string,
  accessToken: string
): Promise<ConnectionRecord> {
  return apiRequest<ConnectionRecord>(
    `/connections/${connectionId}/decline`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function blockConnection(
  connectionId: string,
  accessToken: string
): Promise<ConnectionRecord> {
  return apiRequest<ConnectionRecord>(
    `/connections/${connectionId}/block`,
    {
      method: "POST"
    },
    accessToken
  );
}

export function getMyProfile(accessToken: string): Promise<ProfileRecord> {
  return apiRequest<ProfileRecord>("/profiles/me", {}, accessToken);
}

export function updateMyProfile(
  payload: {
    firstName?: string;
    lastName?: string;
    city?: string;
    area?: string;
    serviceCategories?: string[];
    email?: string;
    phone?: string;
    alternatePhone?: string;
    fullAddress?: string;
  },
  accessToken: string
): Promise<ProfileRecord> {
  return apiRequest<ProfileRecord>(
    "/profiles/me",
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function listConsentRequests(accessToken: string): Promise<AccessRequestRecord[]> {
  return apiRequest<AccessRequestRecord[]>("/consent/requests", {}, accessToken);
}

export function listConsentGrants(accessToken: string): Promise<ConsentGrantRecord[]> {
  return apiRequest<ConsentGrantRecord[]>("/consent/grants", {}, accessToken);
}

export function requestConsentAccess(
  payload: {
    ownerUserId: string;
    connectionId: string;
    requestedFields: ConsentField[];
    purpose: string;
  },
  accessToken: string
): Promise<AccessRequestRecord> {
  return apiRequest<AccessRequestRecord>(
    "/consent/request-access",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function grantConsent(
  requestId: string,
  payload: {
    grantedFields: ConsentField[];
    expiresAt?: string;
    purpose: string;
  },
  accessToken: string
): Promise<ConsentGrantRecord> {
  return apiRequest<ConsentGrantRecord>(
    `/consent/${requestId}/grant`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function revokeConsent(
  grantId: string,
  payload: { reason: string },
  accessToken: string
): Promise<ConsentGrantRecord> {
  return apiRequest<ConsentGrantRecord>(
    `/consent/${grantId}/revoke`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function canViewConsent(
  payload: {
    ownerUserId: string;
    field: ConsentField;
  },
  accessToken: string
): Promise<{ allowed: boolean }> {
  return apiRequest<{ allowed: boolean }>(
    "/consent/can-view",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function listMyMedia(accessToken: string): Promise<MediaAssetRecord[]> {
  return apiRequest<MediaAssetRecord[]>("/media", {}, accessToken);
}

export function listPublicApprovedMedia(ownerUserId: string): Promise<PublicMediaAssetRecord[]> {
  return apiRequest<PublicMediaAssetRecord[]>(
    `/media/public/${encodeURIComponent(ownerUserId)}`
  );
}

export function createMediaUploadTicket(
  payload: {
    kind: MediaKind;
    contentType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    originalFileName: string;
    jobId?: string;
  },
  accessToken: string
): Promise<UploadTicketRecord> {
  return apiRequest<UploadTicketRecord>(
    "/media/upload-ticket",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function completeMediaUpload(
  mediaId: string,
  payload: { etag?: string },
  accessToken: string
): Promise<MediaAssetRecord> {
  return apiRequest<MediaAssetRecord>(
    `/media/${mediaId}/complete`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) {
    return "-";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}
