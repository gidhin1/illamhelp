export type MediaKind = "image" | "video";
export type MediaPurpose = "profile" | "job" | "verification_document";
export type MediaState =
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";

export interface CursorPageResponse<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export interface MediaAssetRecord {
  id: string;
  ownerUserId: string;
  profileUserId: string | null;
  jobId: string | null;
  kind: MediaKind;
  purpose: MediaPurpose;
  bucketName: string;
  objectKey: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  state: MediaState;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMediaAssetRecord {
  id: string;
  ownerUserId: string;
  profileUserId: string | null;
  jobId: string | null;
  kind: MediaKind;
  purpose: MediaPurpose;
  contentType: string;
  fileSizeBytes: number;
  state: MediaState;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
}

export interface UploadTicketRecord {
  mediaId: string;
  bucketName: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface ModerationQueueItem {
  moderationJobId: string;
  mediaId: string;
  stage: "technical_validation" | "ai_review" | "human_review";
  status: "pending" | "running" | "approved" | "rejected" | "error";
  reasonCode: string | null;
  moderationCreatedAt: string;
  mediaState: MediaState;
  ownerUserId: string;
  kind: MediaKind;
  purpose: MediaPurpose;
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
  media: MediaAssetRecord & {
    moderationReasonCodes: string[];
    aiScores: Record<string, unknown> | null;
    previewUrl: string;
    previewUrlExpiresAt: string;
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

export class GrpcWebError extends Error {
  readonly statusCode: number;
  readonly grpcStatus: number;

  constructor(message: string, grpcStatus: number) {
    super(message);
    this.name = "GrpcWebError";
    this.grpcStatus = grpcStatus;
    this.statusCode = grpcStatusToHttp(grpcStatus);
  }
}

export interface MediaClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const MEDIA_SERVICE = "media.v1.MediaService";
const ADMIN_SERVICE = "media.v1.AdminMediaService";

export function createMediaClient(options: MediaClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? defaultGrpcWebBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl;

  function call(path: string, payload: Uint8Array, accessToken: string): Promise<Uint8Array> {
    return grpcWebFetch(fetchImpl ?? fetch, `${baseUrl}/${path}`, payload, accessToken);
  }

  return {
    async createUploadTicket(payload: {
      kind: MediaKind;
      contentType: string;
      fileSizeBytes: number;
      checksumSha256: string;
      originalFileName: string;
      purpose: MediaPurpose;
      jobId?: string | null;
    }, accessToken: string): Promise<UploadTicketRecord> {
      return decodeUploadTicket(await call(`${MEDIA_SERVICE}/CreateUploadTicket`, encodeMessage([
        enumField(1, kindToEnum(payload.kind)),
        stringField(2, payload.contentType),
        intField(3, payload.fileSizeBytes),
        stringField(4, payload.checksumSha256),
        stringField(5, payload.originalFileName),
        enumField(6, purposeToEnum(payload.purpose)),
        stringField(7, payload.jobId ?? "")
      ]), accessToken));
    },

    async completeMediaUpload(mediaId: string, payload: { etag?: string }, accessToken: string): Promise<MediaAssetRecord> {
      return decodeMediaAsset(await call(`${MEDIA_SERVICE}/CompleteUpload`, encodeMessage([
        stringField(1, mediaId),
        stringField(2, payload.etag ?? "")
      ]), accessToken));
    },

    async listMyMediaPage(accessToken: string, cursor?: string): Promise<CursorPageResponse<MediaAssetRecord>> {
      return decodeMediaPage(await call(`${MEDIA_SERVICE}/ListMyMedia`, encodeMessage([
        intField(1, 50),
        stringField(2, cursor ?? "")
      ]), accessToken));
    },

    async listProfileMediaPage(profileUserId: string, accessToken: string, cursor?: string): Promise<CursorPageResponse<PublicMediaAssetRecord>> {
      return decodeDownloadableMediaPage(await call(`${MEDIA_SERVICE}/ListProfileMedia`, encodeMessage([
        stringField(1, profileUserId),
        intField(2, 50),
        stringField(3, cursor ?? "")
      ]), accessToken));
    },

    async listJobMediaPage(jobId: string, accessToken: string, cursor?: string): Promise<CursorPageResponse<PublicMediaAssetRecord>> {
      return decodeDownloadableMediaPage(await call(`${MEDIA_SERVICE}/ListJobMedia`, encodeMessage([
        stringField(1, jobId),
        intField(2, 50),
        stringField(3, cursor ?? "")
      ]), accessToken));
    },

    async listVerificationDocumentsPage(accessToken: string, cursor?: string): Promise<CursorPageResponse<MediaAssetRecord>> {
      return decodeMediaPage(await call(`${MEDIA_SERVICE}/ListVerificationDocuments`, encodeMessage([
        intField(1, 50),
        stringField(2, cursor ?? "")
      ]), accessToken));
    },

    async listModerationQueue(accessToken: string, options?: { status?: string; stage?: string; limit?: number }): Promise<ModerationQueueItem[]> {
      const page = decodeModerationQueuePage(await call(`${ADMIN_SERVICE}/ListModerationQueue`, encodeMessage([
        stringField(1, options?.stage ?? ""),
        stringField(2, options?.status ?? ""),
        intField(3, options?.limit ?? 50)
      ]), accessToken));
      return page;
    },

    async getModerationDetails(mediaId: string, accessToken: string): Promise<ModerationDetails> {
      return decodeModerationDetails(await call(`${ADMIN_SERVICE}/GetModerationDetails`, encodeMessage([
        stringField(1, mediaId)
      ]), accessToken));
    },

    async processModerationQueue(accessToken: string, limit = 10): Promise<ModerationProcessResult> {
      return decodeProcessModeration(await call(`${ADMIN_SERVICE}/ProcessModerationJobs`, encodeMessage([
        intField(1, limit)
      ]), accessToken));
    },

    async reviewMedia(mediaId: string, payload: { decision: "approved" | "rejected"; reasonCode?: string; notes?: string }, accessToken: string): Promise<MediaAssetRecord> {
      return decodeMediaAsset(await call(`${ADMIN_SERVICE}/ReviewMedia`, encodeMessage([
        stringField(1, mediaId),
        stringField(2, payload.decision),
        stringField(3, payload.reasonCode ?? ""),
        stringField(4, payload.notes ?? "")
      ]), accessToken));
    }
  };
}

async function grpcWebFetch(fetchImpl: typeof fetch, url: string, payload: Uint8Array, accessToken: string): Promise<Uint8Array> {
  const requestBody = frame(payload);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/grpc-web+proto",
      "X-Grpc-Web": "1",
      "Authorization": `Bearer ${accessToken}`
    },
    body: requestBody.buffer.slice(requestBody.byteOffset, requestBody.byteOffset + requestBody.byteLength) as ArrayBuffer
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    if (response.status === 401) {
      dispatchAuthExpired();
    }
    throw new GrpcWebError(`Request failed with ${response.status}`, response.status === 401 ? 16 : 13);
  }
  const first = String.fromCharCode(bytes[0] ?? 0).trim();
  if (first === "{" || first === "[") {
    return bytes;
  }
  return unframe(bytes);
}

function frame(message: Uint8Array): Uint8Array {
  const framed = new Uint8Array(message.length + 5);
  framed[0] = 0;
  writeUint32(framed, 1, message.length);
  framed.set(message, 5);
  return framed;
}

function unframe(bytes: Uint8Array): Uint8Array {
  let offset = 0;
  const messages: Uint8Array[] = [];
  let grpcStatus = 0;
  let grpcMessage = "";
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset];
    const length = readUint32(bytes, offset + 1);
    offset += 5;
    const payload = bytes.slice(offset, offset + length);
    offset += length;
    if ((flags & 0x80) === 0x80) {
      const trailers = textDecoder.decode(payload);
      const status = trailers.match(/grpc-status:\s*(\d+)/i);
      const message = trailers.match(/grpc-message:\s*([^\r\n]+)/i);
      grpcStatus = status ? Number(status[1]) : 0;
      grpcMessage = message ? decodeURIComponent(message[1]) : "";
    } else {
      messages.push(payload);
    }
  }
  if (grpcStatus !== 0) {
    throw new GrpcWebError(grpcMessage || `gRPC call failed with status ${grpcStatus}`, grpcStatus);
  }
  return messages[0] ?? new Uint8Array();
}

function encodeMessage(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function stringField(field: number, value: string): Uint8Array {
  if (!value) {
    return new Uint8Array();
  }
  const data = textEncoder.encode(value);
  return encodeMessage([varint((field << 3) | 2), varint(data.length), data]);
}

function bytesField(field: number, value: Uint8Array): Uint8Array {
  return encodeMessage([varint((field << 3) | 2), varint(value.length), value]);
}

function intField(field: number, value: number): Uint8Array {
  if (!value) {
    return new Uint8Array();
  }
  return encodeMessage([varint(field << 3), varint(value)]);
}

function enumField(field: number, value: number): Uint8Array {
  return value === 0 ? new Uint8Array() : encodeMessage([varint(field << 3), varint(value)]);
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let current = Math.max(0, Math.floor(value));
  while (current > 127) {
    bytes.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 128);
  }
  bytes.push(current);
  return new Uint8Array(bytes);
}

function readFields(bytes: Uint8Array): Array<{ field: number; wire: number; value: Uint8Array | number }> {
  const fields: Array<{ field: number; wire: number; value: Uint8Array | number }> = [];
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wire = key.value & 7;
    if (wire === 0) {
      const read = readVarint(bytes, offset);
      fields.push({ field, wire, value: read.value });
      offset = read.offset;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      fields.push({ field, wire, value: bytes.slice(offset, offset + length.value) });
      offset += length.value;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}`);
    }
  }
  return fields;
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; offset: number } {
  let value = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value, offset };
    }
    shift += 7;
  }
  return { value, offset };
}

function decodeUploadTicket(bytes: Uint8Array): UploadTicketRecord {
  const json = parseJsonBytes<UploadTicketRecord>(bytes);
  if (json) return json;
  const out: UploadTicketRecord = {
    uploadUrl: "",
    expiresAt: "",
    requiredHeaders: {},
    mediaId: "",
    bucketName: "",
    objectKey: ""
  };
  for (const item of readFields(bytes)) {
    if (item.wire !== 2) {
      continue;
    }
    const value = stringValue(item.value);
    if (item.field === 1) out.uploadUrl = value;
    if (item.field === 2) out.expiresAt = value;
    if (item.field === 3 && item.value instanceof Uint8Array) {
      const map = readFields(item.value);
      const key = stringValue(map.find((entry) => entry.field === 1)?.value);
      const mapValue = stringValue(map.find((entry) => entry.field === 2)?.value);
      if (key) out.requiredHeaders[key] = mapValue;
    }
    if (item.field === 4) out.mediaId = value;
    if (item.field === 5) out.bucketName = value;
    if (item.field === 6) out.objectKey = value;
  }
  return out;
}

function decodeMediaPage(bytes: Uint8Array): CursorPageResponse<MediaAssetRecord> {
  const json = parseJsonBytes<CursorPageResponse<MediaAssetRecord>>(bytes);
  if (json) return json;
  const page: CursorPageResponse<MediaAssetRecord> = { items: [], limit: 0, nextCursor: null };
  for (const item of readFields(bytes)) {
    if (item.field === 1 && item.value instanceof Uint8Array) page.items.push(decodeMediaAsset(item.value));
    if (item.field === 2 && typeof item.value === "number") page.limit = item.value;
    if (item.field === 3) page.nextCursor = stringValue(item.value) || null;
  }
  return page;
}

function decodeDownloadableMediaPage(bytes: Uint8Array): CursorPageResponse<PublicMediaAssetRecord> {
  const json = parseJsonBytes<CursorPageResponse<PublicMediaAssetRecord>>(bytes);
  if (json) return json;
  const page: CursorPageResponse<PublicMediaAssetRecord> = { items: [], limit: 0, nextCursor: null };
  for (const item of readFields(bytes)) {
    if (item.field === 1 && item.value instanceof Uint8Array) page.items.push(decodeDownloadableMedia(item.value));
    if (item.field === 2 && typeof item.value === "number") page.limit = item.value;
    if (item.field === 3) page.nextCursor = stringValue(item.value) || null;
  }
  return page;
}

function decodeMediaAsset(bytes: Uint8Array): MediaAssetRecord {
  const json = parseJsonBytes<MediaAssetRecord>(bytes);
  if (json) return json;
  const media = emptyMediaAsset();
  for (const item of readFields(bytes)) {
    if (item.field === 1) media.id = stringValue(item.value);
    if (item.field === 2) media.ownerUserId = stringValue(item.value);
    if (item.field === 3) media.profileUserId = stringValue(item.value) || null;
    if (item.field === 4) media.jobId = stringValue(item.value) || null;
    if (item.field === 5 && typeof item.value === "number") media.kind = enumToKind(item.value);
    if (item.field === 6 && typeof item.value === "number") media.purpose = enumToPurpose(item.value);
    if (item.field === 7) media.bucketName = stringValue(item.value);
    if (item.field === 8) media.objectKey = stringValue(item.value);
    if (item.field === 9) media.contentType = stringValue(item.value);
    if (item.field === 10 && typeof item.value === "number") media.fileSizeBytes = item.value;
    if (item.field === 11) media.checksumSha256 = stringValue(item.value);
    if (item.field === 12 && typeof item.value === "number") media.state = enumToState(item.value);
    if (item.field === 13) media.createdAt = stringValue(item.value);
    if (item.field === 14) media.updatedAt = stringValue(item.value);
  }
  return media;
}

function decodeDownloadableMedia(bytes: Uint8Array): PublicMediaAssetRecord {
  const media: PublicMediaAssetRecord = {
    id: "",
    ownerUserId: "",
    profileUserId: null,
    jobId: null,
    kind: "image",
    purpose: "profile",
    contentType: "",
    fileSizeBytes: 0,
    state: "approved",
    createdAt: "",
    updatedAt: "",
    downloadUrl: "",
    downloadUrlExpiresAt: ""
  };
  for (const item of readFields(bytes)) {
    if (item.field === 1) media.id = stringValue(item.value);
    if (item.field === 2) media.ownerUserId = stringValue(item.value);
    if (item.field === 3) media.profileUserId = stringValue(item.value) || null;
    if (item.field === 4) media.jobId = stringValue(item.value) || null;
    if (item.field === 5 && typeof item.value === "number") media.kind = enumToKind(item.value);
    if (item.field === 6 && typeof item.value === "number") media.purpose = enumToPurpose(item.value);
    if (item.field === 7) media.contentType = stringValue(item.value);
    if (item.field === 8 && typeof item.value === "number") media.fileSizeBytes = item.value;
    if (item.field === 9 && typeof item.value === "number") media.state = enumToState(item.value);
    if (item.field === 10) media.createdAt = stringValue(item.value);
    if (item.field === 11) media.updatedAt = stringValue(item.value);
    if (item.field === 12) media.downloadUrl = stringValue(item.value);
    if (item.field === 13) media.downloadUrlExpiresAt = stringValue(item.value);
  }
  return media;
}

function decodeModerationQueuePage(bytes: Uint8Array): ModerationQueueItem[] {
  const json = parseJsonBytes<ModerationQueueItem[]>(bytes);
  if (json) return json;
  return readFields(bytes)
    .filter((item) => item.field === 1 && item.value instanceof Uint8Array)
    .map((item) => decodeModerationQueueItem(item.value as Uint8Array));
}

function decodeModerationQueueItem(bytes: Uint8Array): ModerationQueueItem {
  const item: ModerationQueueItem = {
    moderationJobId: "",
    mediaId: "",
    stage: "human_review",
    status: "pending",
    reasonCode: null,
    moderationCreatedAt: "",
    mediaState: "human_review_pending",
    ownerUserId: "",
    kind: "image",
    purpose: "profile",
    contentType: "",
    fileSizeBytes: 0
  };
  for (const field of readFields(bytes)) {
    if (field.field === 1) item.moderationJobId = stringValue(field.value);
    if (field.field === 2) item.mediaId = stringValue(field.value);
    if (field.field === 3) item.stage = stringValue(field.value) as ModerationQueueItem["stage"];
    if (field.field === 4) item.status = stringValue(field.value) as ModerationQueueItem["status"];
    if (field.field === 5) item.reasonCode = stringValue(field.value) || null;
    if (field.field === 6) item.moderationCreatedAt = stringValue(field.value);
    if (field.field === 7 && typeof field.value === "number") item.mediaState = enumToState(field.value);
    if (field.field === 8) item.ownerUserId = stringValue(field.value);
    if (field.field === 9 && typeof field.value === "number") item.kind = enumToKind(field.value);
    if (field.field === 10 && typeof field.value === "number") item.purpose = enumToPurpose(field.value);
    if (field.field === 11) item.contentType = stringValue(field.value);
    if (field.field === 12 && typeof field.value === "number") item.fileSizeBytes = field.value;
  }
  return item;
}

function decodeModerationDetails(bytes: Uint8Array): ModerationDetails {
  const json = parseJsonBytes<ModerationDetails>(bytes);
  if (json) return json;
  let media: ModerationDetails["media"] | null = null;
  const moderationJobs: ModerationJobRecord[] = [];
  for (const field of readFields(bytes)) {
    if (field.field === 1 && field.value instanceof Uint8Array) media = decodeModerationMedia(field.value);
    if (field.field === 2 && field.value instanceof Uint8Array) moderationJobs.push(decodeModerationJob(field.value));
  }
  return { media: media ?? { ...emptyMediaAsset(), moderationReasonCodes: [], aiScores: null, previewUrl: "", previewUrlExpiresAt: "" }, moderationJobs };
}

function decodeModerationMedia(bytes: Uint8Array): ModerationDetails["media"] {
  const media = { ...emptyMediaAsset(), moderationReasonCodes: [] as string[], aiScores: null as Record<string, unknown> | null, previewUrl: "", previewUrlExpiresAt: "" };
  for (const field of readFields(bytes)) {
    if (field.field === 1) media.id = stringValue(field.value);
    if (field.field === 2) media.ownerUserId = stringValue(field.value);
    if (field.field === 3) media.profileUserId = stringValue(field.value) || null;
    if (field.field === 4) media.jobId = stringValue(field.value) || null;
    if (field.field === 5 && typeof field.value === "number") media.kind = enumToKind(field.value);
    if (field.field === 6 && typeof field.value === "number") media.purpose = enumToPurpose(field.value);
    if (field.field === 7) media.bucketName = stringValue(field.value);
    if (field.field === 8) media.objectKey = stringValue(field.value);
    if (field.field === 9) media.contentType = stringValue(field.value);
    if (field.field === 10 && typeof field.value === "number") media.fileSizeBytes = field.value;
    if (field.field === 11) media.checksumSha256 = stringValue(field.value);
    if (field.field === 12 && typeof field.value === "number") media.state = enumToState(field.value);
    if (field.field === 13) media.moderationReasonCodes.push(stringValue(field.value));
    if (field.field === 14) media.aiScores = parseJson(stringValue(field.value));
    if (field.field === 15) media.createdAt = stringValue(field.value);
    if (field.field === 16) media.updatedAt = stringValue(field.value);
    if (field.field === 17) media.previewUrl = stringValue(field.value);
    if (field.field === 18) media.previewUrlExpiresAt = stringValue(field.value);
  }
  return media;
}

function decodeModerationJob(bytes: Uint8Array): ModerationJobRecord {
  const job: ModerationJobRecord = {
    id: "",
    mediaAssetId: "",
    stage: "human_review",
    status: "pending",
    assignedModeratorUserId: null,
    reasonCode: null,
    details: {},
    createdAt: "",
    completedAt: null
  };
  for (const field of readFields(bytes)) {
    if (field.field === 1) job.id = stringValue(field.value);
    if (field.field === 2) job.mediaAssetId = stringValue(field.value);
    if (field.field === 3) job.stage = stringValue(field.value) as ModerationJobRecord["stage"];
    if (field.field === 4) job.status = stringValue(field.value) as ModerationJobRecord["status"];
    if (field.field === 5) job.assignedModeratorUserId = stringValue(field.value) || null;
    if (field.field === 6) job.reasonCode = stringValue(field.value) || null;
    if (field.field === 7) job.details = parseJson(stringValue(field.value)) ?? {};
    if (field.field === 8) job.createdAt = stringValue(field.value);
    if (field.field === 9) job.completedAt = stringValue(field.value) || null;
  }
  return job;
}

function decodeProcessModeration(bytes: Uint8Array): ModerationProcessResult {
  const json = parseJsonBytes<ModerationProcessResult>(bytes);
  if (json) return json;
  const result: ModerationProcessResult = { selected: 0, processed: 0, technicalApproved: 0, technicalRejected: 0, aiCompleted: 0, errors: 0 };
  for (const field of readFields(bytes)) {
    if (typeof field.value !== "number") continue;
    if (field.field === 1) result.selected = field.value;
    if (field.field === 2) result.processed = field.value;
    if (field.field === 3) result.technicalApproved = field.value;
    if (field.field === 4) result.technicalRejected = field.value;
    if (field.field === 5) result.aiCompleted = field.value;
    if (field.field === 6) result.errors = field.value;
  }
  return result;
}

function emptyMediaAsset(): MediaAssetRecord {
  return {
    id: "",
    ownerUserId: "",
    profileUserId: null,
    jobId: null,
    kind: "image",
    purpose: "profile",
    bucketName: "",
    objectKey: "",
    contentType: "",
    fileSizeBytes: 0,
    checksumSha256: "",
    state: "uploaded",
    createdAt: "",
    updatedAt: ""
  };
}

function stringValue(value: Uint8Array | number | undefined): string {
  return value instanceof Uint8Array ? textDecoder.decode(value) : "";
}

function kindToEnum(kind: MediaKind): number {
  return kind === "video" ? 2 : 1;
}

function enumToKind(value: number): MediaKind {
  return value === 2 ? "video" : "image";
}

function purposeToEnum(purpose: MediaPurpose): number {
  if (purpose === "job") return 2;
  if (purpose === "verification_document") return 3;
  return 1;
}

function enumToPurpose(value: number): MediaPurpose {
  if (value === 2) return "job";
  if (value === 3) return "verification_document";
  return "profile";
}

function enumToState(value: number): MediaState {
  const values: Record<number, MediaState> = {
    1: "uploaded",
    2: "scanning",
    3: "ai_reviewed",
    4: "human_review_pending",
    5: "approved",
    6: "rejected",
    7: "appeal_pending",
    8: "appeal_resolved"
  };
  return values[value] ?? "uploaded";
}

function parseJson(value: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseJsonBytes<T>(bytes: Uint8Array): T | null {
  if (bytes.length === 0) return null;
  const first = String.fromCharCode(bytes[0]).trim();
  if (first !== "{" && first !== "[") return null;
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function grpcStatusToHttp(status: number): number {
  if (status === 0) return 200;
  if (status === 3) return 400;
  if (status === 5) return 404;
  if (status === 7) return 403;
  if (status === 16) return 401;
  return 500;
}

function dispatchAuthExpired(): void {
  const maybeWindow = globalThis as unknown as {
    window?: { dispatchEvent?: (event: Event) => void };
    CustomEvent?: new (type: string) => Event;
  };
  if (maybeWindow.window?.dispatchEvent && maybeWindow.CustomEvent) {
    maybeWindow.window.dispatchEvent(new maybeWindow.CustomEvent("illamhelp:auth-expired"));
  }
}

function defaultGrpcWebBaseUrl(): string {
  const env = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return env.process?.env?.NEXT_PUBLIC_MEDIA_GRPC_WEB_URL ?? "http://localhost:9091";
}
