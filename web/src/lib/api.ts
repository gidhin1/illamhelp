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

export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4000/api/v1";

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = undefined;
    }
    const message = asErrorMessage(payload, `Request failed with ${response.status}`);
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("illamhelp:auth-expired"));
    }
    throw new ApiRequestError(message, response.status);
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

export function refreshSession(refreshToken: string): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export function logoutSession(refreshToken: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function listJobs(
  accessToken: string,
  pagination?: { limit?: number; offset?: number }
): Promise<PaginatedResponse<JobRecord>> {
  const params = new URLSearchParams();
  if (pagination?.limit != null) {
    params.set("limit", String(pagination.limit));
  }
  if (pagination?.offset != null) {
    params.set("offset", String(pagination.offset));
  }
  const query = params.toString();
  const path = query ? `/jobs?${query}` : "/jobs";
  return apiRequest<PaginatedResponse<JobRecord>>(path, {}, accessToken);
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

export function revokeJobAssignment(
  jobId: string,
  payload: { reason?: string },
  accessToken: string
): Promise<JobRecord> {
  return apiRequest<JobRecord>(
    `/jobs/${jobId}/booking/revoke-assignment`,
    {
      method: "POST",
      body: JSON.stringify(payload)
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

export function listConnections(
  accessToken: string,
  pagination?: { limit?: number; offset?: number }
): Promise<PaginatedResponse<ConnectionRecord>> {
  const params = new URLSearchParams();
  if (pagination?.limit != null) {
    params.set("limit", String(pagination.limit));
  }
  if (pagination?.offset != null) {
    params.set("offset", String(pagination.offset));
  }
  const query = params.toString();
  const path = query ? `/connections?${query}` : "/connections";
  return apiRequest<PaginatedResponse<ConnectionRecord>>(path, {}, accessToken);
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

export function getProfileByUserId(
  targetUserId: string,
  accessToken: string
): Promise<ProfileRecord> {
  return apiRequest<ProfileRecord>(
    `/profiles/${encodeURIComponent(targetUserId)}`,
    {},
    accessToken
  );
}

export interface DashboardResponse {
  profile: ProfileRecord;
  metrics: {
    totalJobs: number;
    totalConnections: number;
    pendingConnections: number;
    consentRequests: number;
    activeConsentGrants: number;
    totalMedia: number;
  };
  recentJobs: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    locationText: string;
    createdAt: string;
  }>;
}

export function getMyDashboard(accessToken: string): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>("/profiles/me/dashboard", {}, accessToken);
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

// --- Verification ---

export type VerificationStatus = "pending" | "under_review" | "approved" | "rejected";

export interface VerificationRecord {
  id: string;
  userId: string;
  documentMediaIds: string[];
  documentType: string;
  notes: string | null;
  status: VerificationStatus;
  reviewerUserId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function submitVerification(
  payload: {
    documentType: string;
    documentMediaIds: string[];
    notes?: string;
  },
  accessToken: string
): Promise<VerificationRecord> {
  return apiRequest<VerificationRecord>(
    "/profiles/me/verification",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function getMyVerification(accessToken: string): Promise<VerificationRecord | null> {
  return apiRequest<VerificationRecord | null>("/profiles/me/verification", {}, accessToken);
}

export function listVerifications(
  params: { status?: string; limit?: number; offset?: number },
  accessToken: string
): Promise<PaginatedResponse<VerificationRecord>> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return apiRequest<PaginatedResponse<VerificationRecord>>(
    q ? `/admin/oversight/verifications?${q}` : "/admin/oversight/verifications",
    {},
    accessToken
  );
}

export function reviewVerification(
  requestId: string,
  payload: { decision: "approved" | "rejected"; notes?: string },
  accessToken: string
): Promise<VerificationRecord> {
  return apiRequest<VerificationRecord>(
    `/admin/oversight/verifications/${requestId}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

// --- Notifications ---

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  total: number;
  limit: number;
  offset: number;
  unreadCount: number;
}

export function listNotifications(
  params: { unreadOnly?: boolean; limit?: number; offset?: number },
  accessToken: string
): Promise<NotificationListResponse> {
  const qs = new URLSearchParams();
  if (params.unreadOnly) qs.set("unreadOnly", "true");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return apiRequest<NotificationListResponse>(
    q ? `/notifications?${q}` : "/notifications",
    {},
    accessToken
  );
}

export function getUnreadNotificationCount(accessToken: string): Promise<{ unreadCount: number }> {
  return apiRequest<{ unreadCount: number }>("/notifications/unread-count", {}, accessToken);
}

export function markNotificationRead(
  notificationId: string,
  accessToken: string
): Promise<NotificationRecord> {
  return apiRequest<NotificationRecord>(
    `/notifications/${notificationId}/read`,
    { method: "PATCH" },
    accessToken
  );
}

export function markAllNotificationsRead(
  accessToken: string
): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>(
    "/notifications/read-all",
    { method: "PATCH" },
    accessToken
  );
}
