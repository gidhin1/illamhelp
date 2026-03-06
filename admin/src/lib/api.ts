export type AppRole = "both" | "seeker" | "provider" | "admin" | "support";

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
  roles: AppRole[];
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthenticatedUser {
  userId: string;
  publicUserId: string;
  tokenSubject: string;
  roles: AppRole[];
}

export interface ModerationQueueItem {
  moderationJobId: string;
  mediaId: string;
  stage: "technical_validation" | "ai_review" | "human_review";
  status: "pending" | "running" | "approved" | "rejected" | "error";
  reasonCode: string | null;
  moderationCreatedAt: string;
  mediaState:
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";
  ownerUserId: string;
  kind: "image" | "video";
  contentType: string;
  fileSizeBytes: number;
}

export interface ModerationJobRecord {
  id: string;
  mediaAssetId: string;
  stage: "technical_validation" | "ai_review" | "human_review";
  status: "pending" | "running" | "approved" | "rejected" | "error";
  assignedModeratorUserId: string | null;
  reasonCode: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface ModerationDetails {
  media: {
    id: string;
    ownerUserId: string;
    kind: "image" | "video";
    bucketName: string;
    objectKey: string;
    contentType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    state: string;
    moderationReasonCodes: string[];
    aiScores: Record<string, unknown> | null;
    previewUrl: string;
    previewUrlExpiresAt: string;
    createdAt: string;
    updatedAt: string;
  };
  moderationJobs: ModerationJobRecord[];
}

export interface ModerationProcessResult {
  selected: number;
  processed: number;
  technicalApproved: number;
  technicalRejected: number;
  aiCompleted: number;
  errors: number;
}

export interface AdminTimelineResponse {
  member: {
    userId: string;
    publicUserId: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  };
  accessRequests: Array<{
    id: string;
    requesterUserId: string;
    ownerUserId: string;
    requestedFields: string[];
    purpose: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  consentGrants: Array<{
    id: string;
    ownerUserId: string;
    granteeUserId: string;
    grantedFields: string[];
    purpose: string;
    status: string;
    grantedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    purpose: string | null;
    actorUserId: string | null;
    targetUserId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
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

export function listModerationQueue(
  accessToken: string,
  options?: { status?: string; limit?: number }
): Promise<ModerationQueueItem[]> {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set("status", options.status);
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  const path = query
    ? `/admin/media/moderation-queue?${query}`
    : "/admin/media/moderation-queue";
  return apiRequest<ModerationQueueItem[]>(path, {}, accessToken);
}

export function getModerationDetails(
  mediaId: string,
  accessToken: string
): Promise<ModerationDetails> {
  return apiRequest<ModerationDetails>(`/admin/media/${mediaId}/moderation`, {}, accessToken);
}

export function processModerationQueue(
  accessToken: string,
  limit = 10
): Promise<ModerationProcessResult> {
  return apiRequest<ModerationProcessResult>(
    "/admin/media/moderation/process",
    {
      method: "POST",
      body: JSON.stringify({ limit })
    },
    accessToken
  );
}

export function reviewMedia(
  mediaId: string,
  payload: {
    decision: "approved" | "rejected";
    reasonCode?: string;
    notes?: string;
  },
  accessToken: string
): Promise<ModerationDetails["media"]> {
  return apiRequest<ModerationDetails["media"]>(
    `/admin/media/${mediaId}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  );
}

export function fetchMemberTimeline(
  memberId: string,
  accessToken: string,
  limit = 100
): Promise<AdminTimelineResponse> {
  const params = new URLSearchParams();
  params.set("memberId", memberId.trim());
  params.set("limit", String(limit));
  return apiRequest<AdminTimelineResponse>(
    `/admin/oversight/timeline?${params.toString()}`,
    {},
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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

