import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, randomUUID } from "node:crypto";

import { DatabaseService } from "../../common/database/database.service";
import { InternalEventsService } from "../../common/events/internal-events.service";
import {
  encodeMediaUploadCompletedEvent,
  encodeMediaUploadTicketIssuedEvent,
  INTERNAL_EVENT_NAMES,
  INTERNAL_EVENT_VERSION
} from "../../common/events/protobuf/internal-events.codec";
import { assertUuid } from "../../common/utils/uuid";
import { AuditService } from "../audit/audit.service";
import { MediaKind } from "./dto/create-upload-ticket.dto";

type MediaState =
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";

interface CreateUploadTicketInput {
  ownerUserId: string;
  kind: MediaKind;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  originalFileName: string;
  jobId?: string;
}

interface CompleteUploadInput {
  mediaId: string;
  ownerUserId: string;
  etag?: string;
}

interface DbMediaRow {
  id: string;
  owner_user_id: string;
  job_id: string | null;
  kind: MediaKind;
  bucket_name: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number | string;
  checksum_sha256: string;
  state: MediaState;
  created_at: Date;
  updated_at: Date;
}

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
  state: MediaState;
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

type HttpMethod = "PUT" | "HEAD";

@Injectable()
export class MediaService {
  private readonly bucketName: string;
  private readonly publicEndpoint: string;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly uploadTtlSeconds: number;
  private readonly maxImageBytes: number;
  private readonly maxVideoBytes: number;
  private readonly allowedImageTypes: Set<string>;
  private readonly allowedVideoTypes: Set<string>;
  private readonly extensionByContentType: Record<string, string[]>;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly internalEventsService: InternalEventsService,
    configService: ConfigService
  ) {
    this.bucketName = configService.get<string>(
      "MINIO_QUARANTINE_BUCKET",
      "illamhelp-quarantine"
    );
    this.publicEndpoint = configService.get<string>(
      "MINIO_PUBLIC_ENDPOINT",
      configService.get<string>("MINIO_ENDPOINT", "http://localhost:9000")
    );
    this.region = configService.get<string>("MINIO_REGION", "us-east-1");
    this.accessKey = configService.get<string>("MINIO_ROOT_USER", "");
    this.secretKey = configService.get<string>("MINIO_ROOT_PASSWORD", "");
    this.uploadTtlSeconds = this.parsePositiveInt(
      configService.get<string>("MEDIA_UPLOAD_URL_TTL_SECONDS", "900"),
      900
    );
    this.maxImageBytes = this.parsePositiveInt(
      configService.get<string>("MEDIA_MAX_IMAGE_BYTES", "10485760"),
      10 * 1024 * 1024
    );
    this.maxVideoBytes = this.parsePositiveInt(
      configService.get<string>("MEDIA_MAX_VIDEO_BYTES", "104857600"),
      100 * 1024 * 1024
    );

    this.allowedImageTypes = new Set(
      this.parseCsv(
        configService.get<string>(
          "MEDIA_ALLOWED_IMAGE_TYPES",
          "image/jpeg,image/png,image/webp"
        )
      )
    );
    this.allowedVideoTypes = new Set(
      this.parseCsv(
        configService.get<string>(
          "MEDIA_ALLOWED_VIDEO_TYPES",
          "video/mp4,video/quicktime,video/webm"
        )
      )
    );

    this.extensionByContentType = {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/webp": ["webp"],
      "video/mp4": ["mp4"],
      "video/quicktime": ["mov"],
      "video/webm": ["webm"]
    };
  }

  async listMine(ownerUserId: string): Promise<MediaAssetRecord[]> {
    assertUuid(ownerUserId, "ownerUserId");

    const result = await this.databaseService.query<DbMediaRow>(
      `
      SELECT
        id,
        owner_user_id,
        job_id,
        kind,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        created_at,
        updated_at
      FROM media_assets
      WHERE owner_user_id = $1::uuid
      ORDER BY created_at DESC
      `,
      [ownerUserId]
    );

    return result.rows.map((row) => this.mapMediaRow(row));
  }

  async createUploadTicket(input: CreateUploadTicketInput): Promise<UploadTicketRecord> {
    assertUuid(input.ownerUserId, "ownerUserId");
    const contentType = input.contentType.trim().toLowerCase();
    const checksumSha256 = input.checksumSha256.trim().toLowerCase();
    const originalFileName = input.originalFileName.trim();

    this.assertStorageConfigured();
    this.validateMetadata({
      ...input,
      contentType,
      checksumSha256,
      originalFileName
    });

    if (input.jobId) {
      assertUuid(input.jobId, "jobId");
      await this.assertJobOwnership(input.jobId, input.ownerUserId);
    }

    const mediaId = randomUUID();
    const extension = this.resolveExtension(contentType, originalFileName);
    const objectKey = this.buildObjectKey(input.ownerUserId, mediaId, originalFileName, extension);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.uploadTtlSeconds * 1000);
    const requiredHeaders = {
      "content-type": contentType,
      "x-amz-meta-checksum-sha256": checksumSha256
    };
    const uploadUrl = this.createPresignedUrl({
      method: "PUT",
      bucketName: this.bucketName,
      objectKey,
      expiresSeconds: this.uploadTtlSeconds,
      now,
      requiredHeaders
    });

    await this.databaseService.query(
      `
      INSERT INTO media_assets (
        id,
        owner_user_id,
        job_id,
        kind,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::media_kind,
        $5::text,
        $6::text,
        $7::text,
        $8::bigint,
        $9::text,
        'uploaded'::media_state
      )
      `,
      [
        mediaId,
        input.ownerUserId,
        input.jobId ?? null,
        input.kind,
        this.bucketName,
        objectKey,
        contentType,
        input.fileSizeBytes,
        checksumSha256
      ]
    );

    await this.databaseService.query(
      `
      INSERT INTO moderation_jobs (
        media_asset_id,
        stage,
        status,
        details
      )
      VALUES (
        $1::uuid,
        'technical_validation'::moderation_stage,
        'pending'::moderation_status,
        $2::jsonb
      )
      `,
      [
        mediaId,
        JSON.stringify({
          source: "upload_ticket",
          expectedContentType: contentType,
          expectedSize: input.fileSizeBytes
        })
      ]
    );

    await this.auditService.logEvent({
      actorUserId: input.ownerUserId,
      targetUserId: input.ownerUserId,
      eventType: "media_upload_ticket_issued",
      metadata: {
        mediaId,
        bucketName: this.bucketName,
        objectKey,
        kind: input.kind,
        contentType,
        fileSizeBytes: input.fileSizeBytes,
        expiresAt: expiresAt.toISOString()
      }
    });

    const ticketIssuedEvent = {
      eventId: randomUUID(),
      occurredAt: now.toISOString(),
      actorUserId: input.ownerUserId,
      mediaId,
      bucketName: this.bucketName,
      objectKey,
      kind: input.kind,
      contentType,
      fileSizeBytes: input.fileSizeBytes,
      checksumSha256
    };

    await this.internalEventsService.appendEvent({
      eventName: INTERNAL_EVENT_NAMES.MEDIA_UPLOAD_TICKET_ISSUED,
      eventVersion: INTERNAL_EVENT_VERSION,
      actorUserId: input.ownerUserId,
      payloadProtobuf: encodeMediaUploadTicketIssuedEvent(ticketIssuedEvent),
      payloadJson: ticketIssuedEvent,
      headers: {
        contentType: "application/x-protobuf",
        schema: "proto/internal/events/v1/media_events.proto#MediaUploadTicketIssuedEvent"
      }
    });

    return {
      mediaId,
      bucketName: this.bucketName,
      objectKey,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
      requiredHeaders
    };
  }

  async completeUpload(input: CompleteUploadInput): Promise<MediaAssetRecord> {
    assertUuid(input.mediaId, "mediaId");
    assertUuid(input.ownerUserId, "ownerUserId");
    this.assertStorageConfigured();

    const existing = await this.databaseService.query<DbMediaRow>(
      `
      SELECT
        id,
        owner_user_id,
        job_id,
        kind,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        created_at,
        updated_at
      FROM media_assets
      WHERE id = $1::uuid AND owner_user_id = $2::uuid
      `,
      [input.mediaId, input.ownerUserId]
    );

    if (!existing.rowCount) {
      throw new NotFoundException("Media asset not found");
    }

    const asset = existing.rows[0];
    if (asset.state !== "uploaded" && asset.state !== "scanning") {
      throw new BadRequestException(`Media asset cannot be completed from state '${asset.state}'`);
    }

    const headUrl = this.createPresignedUrl({
      method: "HEAD",
      bucketName: asset.bucket_name,
      objectKey: asset.object_key,
      expiresSeconds: 120,
      now: new Date()
    });

    let headResponse: Response;
    try {
      headResponse = await fetch(headUrl, { method: "HEAD" });
    } catch (error) {
      throw new BadGatewayException(
        `Failed to verify uploaded object in storage: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }

    if (!headResponse.ok) {
      throw new BadGatewayException(
        `Uploaded object verification failed with status ${headResponse.status}`
      );
    }

    const headContentType = headResponse.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    const headContentLength = this.parsePositiveInt(
      headResponse.headers.get("content-length") ?? "0",
      0
    );
    const expectedFileSizeBytes = this.parsePositiveInt(asset.file_size_bytes, 0);
    const headChecksum = headResponse.headers
      .get("x-amz-meta-checksum-sha256")
      ?.trim()
      .toLowerCase();
    const headEtag = this.normalizeEtag(headResponse.headers.get("etag"));
    const expectedEtag = this.normalizeEtag(input.etag);

    if (headContentType !== asset.content_type) {
      throw new BadRequestException(
        `Uploaded object content type mismatch: expected '${asset.content_type}', got '${headContentType ?? "unknown"}'`
      );
    }

    if (headContentLength !== expectedFileSizeBytes) {
      throw new BadRequestException(
        `Uploaded object size mismatch: expected ${expectedFileSizeBytes}, got ${headContentLength}`
      );
    }

    if (!headChecksum || headChecksum !== asset.checksum_sha256) {
      throw new BadRequestException("Uploaded object checksum metadata mismatch");
    }

    if (expectedEtag && headEtag && expectedEtag !== headEtag) {
      throw new BadRequestException("Uploaded object etag mismatch");
    }

    const updated = await this.databaseService.query<DbMediaRow>(
      `
      UPDATE media_assets
      SET state = 'scanning'::media_state,
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        owner_user_id,
        job_id,
        kind,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        created_at,
        updated_at
      `,
      [input.mediaId]
    );

    await this.auditService.logEvent({
      actorUserId: input.ownerUserId,
      targetUserId: input.ownerUserId,
      eventType: "media_upload_completed",
      metadata: {
        mediaId: input.mediaId,
        etag: expectedEtag ?? null,
        verifiedContentType: headContentType,
        verifiedSizeBytes: headContentLength,
        verifiedChecksumSha256: headChecksum,
        verifiedByHead: true
      }
    });

    const completedAt = new Date().toISOString();
    const completedEvent = {
      eventId: randomUUID(),
      occurredAt: completedAt,
      actorUserId: input.ownerUserId,
      mediaId: input.mediaId,
      etag: expectedEtag ?? "",
      verifiedByHead: true
    };

    await this.internalEventsService.appendEvent({
      eventName: INTERNAL_EVENT_NAMES.MEDIA_UPLOAD_COMPLETED,
      eventVersion: INTERNAL_EVENT_VERSION,
      actorUserId: input.ownerUserId,
      payloadProtobuf: encodeMediaUploadCompletedEvent(completedEvent),
      payloadJson: completedEvent,
      headers: {
        contentType: "application/x-protobuf",
        schema: "proto/internal/events/v1/media_events.proto#MediaUploadCompletedEvent"
      }
    });

    return this.mapMediaRow(updated.rows[0]);
  }

  private mapMediaRow(row: DbMediaRow): MediaAssetRecord {
    const fileSizeBytes = this.parsePositiveInt(row.file_size_bytes, 0);
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      jobId: row.job_id,
      kind: row.kind,
      bucketName: row.bucket_name,
      objectKey: row.object_key,
      contentType: row.content_type,
      fileSizeBytes,
      checksumSha256: row.checksum_sha256,
      state: row.state,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private validateMetadata(input: {
    kind: MediaKind;
    contentType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    originalFileName: string;
  }): void {
    const maxBytes = input.kind === "image" ? this.maxImageBytes : this.maxVideoBytes;

    if (input.fileSizeBytes <= 0 || input.fileSizeBytes > maxBytes) {
      throw new BadRequestException(
        `${input.kind} file size must be between 1 and ${maxBytes} bytes`
      );
    }

    const allowedTypes = input.kind === "image" ? this.allowedImageTypes : this.allowedVideoTypes;
    if (!allowedTypes.has(input.contentType)) {
      throw new BadRequestException(
        `Unsupported content type '${input.contentType}' for ${input.kind}`
      );
    }

    if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256)) {
      throw new BadRequestException("checksumSha256 must be a 64-char hex SHA-256 digest");
    }

    if (input.originalFileName.length < 3 || input.originalFileName.length > 160) {
      throw new BadRequestException("originalFileName must be between 3 and 160 characters");
    }

    const extension = this.fileExtension(input.originalFileName);
    const allowedExtensions = this.extensionByContentType[input.contentType] ?? [];
    if (!extension || !allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `File extension does not match content type '${input.contentType}'`
      );
    }
  }

  private fileExtension(fileName: string): string | null {
    const normalized = fileName.trim().toLowerCase();
    const parts = normalized.split(".");
    if (parts.length < 2) {
      return null;
    }
    return parts.at(-1) ?? null;
  }

  private resolveExtension(contentType: string, originalFileName: string): string {
    const extension = this.fileExtension(originalFileName);
    const allowed = this.extensionByContentType[contentType] ?? [];

    if (!extension || !allowed.includes(extension)) {
      throw new BadRequestException(
        `File extension does not match content type '${contentType}'`
      );
    }

    return extension;
  }

  private buildObjectKey(
    ownerUserId: string,
    mediaId: string,
    originalFileName: string,
    extension: string
  ): string {
    const baseName = originalFileName.slice(0, originalFileName.length - extension.length - 1);
    const safeBaseName = baseName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    const fallbackBase = safeBaseName.length > 0 ? safeBaseName : "upload";
    const datePrefix = new Date().toISOString().slice(0, 10);

    return `${ownerUserId}/${datePrefix}/${mediaId}-${fallbackBase}.${extension}`;
  }

  private parseCsv(value: string): string[] {
    return value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  private parsePositiveInt(value: string | number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }

  private normalizeEtag(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.trim().replace(/^"+|"+$/g, "").toLowerCase() || undefined;
  }

  private assertStorageConfigured(): void {
    if (!this.accessKey || !this.secretKey) {
      throw new BadGatewayException(
        "MinIO credentials are missing. Set MINIO_ROOT_USER and MINIO_ROOT_PASSWORD."
      );
    }

    try {
      new URL(this.publicEndpoint);
    } catch {
      throw new BadGatewayException(
        "MINIO_PUBLIC_ENDPOINT is invalid. Expected URL like http://localhost:9000."
      );
    }
  }

  private async assertJobOwnership(jobId: string, ownerUserId: string): Promise<void> {
    const result = await this.databaseService.query<{ id: string }>(
      `
      SELECT id
      FROM jobs
      WHERE id = $1::uuid
        AND seeker_user_id = $2::uuid
      `,
      [jobId, ownerUserId]
    );

    if (!result.rowCount) {
      throw new BadRequestException("jobId is not valid for this user");
    }
  }

  private createPresignedUrl(params: {
    method: HttpMethod;
    bucketName: string;
    objectKey: string;
    expiresSeconds: number;
    now: Date;
    requiredHeaders?: Record<string, string>;
  }): string {
    const endpoint = new URL(this.publicEndpoint);
    const amzDate = this.toAmzDate(params.now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalUri = this.buildCanonicalUri(endpoint.pathname, params.bucketName, params.objectKey);
    const extraHeaders = Object.entries(params.requiredHeaders ?? {}).map(([key, value]) => [
      key.trim().toLowerCase(),
      value.trim()
    ]);
    const headerPairs = [["host", endpoint.host], ...extraHeaders].sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const signedHeaders = headerPairs.map(([key]) => key).join(";");
    const canonicalHeaders = headerPairs.map(([key, value]) => `${key}:${value}\n`).join("");

    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKey}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": `${params.expiresSeconds}`,
      "X-Amz-SignedHeaders": signedHeaders
    };

    const canonicalQuery = this.canonicalQueryString(query);
    const canonicalRequest = [
      params.method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD"
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest)
    ].join("\n");

    const signingKey = this.signingKey(dateStamp);
    const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
    const fullQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;

    return `${endpoint.protocol}//${endpoint.host}${canonicalUri}?${fullQuery}`;
  }

  private buildCanonicalUri(basePathname: string, bucketName: string, objectKey: string): string {
    const trimmedBase = basePathname.replace(/\/+$/g, "");
    const bucketPart = this.encodePathSegment(bucketName);
    const keyPart = objectKey
      .split("/")
      .map((segment) => this.encodePathSegment(segment))
      .join("/");
    const prefix = trimmedBase.length > 0 ? trimmedBase : "";

    return `${prefix}/${bucketPart}/${keyPart}`.replace(/\/{2,}/g, "/");
  }

  private canonicalQueryString(query: Record<string, string>): string {
    return Object.entries(query)
      .sort(([aKey, aValue], [bKey, bValue]) => {
        if (aKey === bKey) {
          return aValue.localeCompare(bValue);
        }
        return aKey.localeCompare(bKey);
      })
      .map(
        ([key, value]) => `${this.encodeQueryComponent(key)}=${this.encodeQueryComponent(value)}`
      )
      .join("&");
  }

  private signingKey(dateStamp: string): Buffer {
    const kDate = createHmac("sha256", `AWS4${this.secretKey}`)
      .update(dateStamp, "utf8")
      .digest();
    const kRegion = createHmac("sha256", kDate).update(this.region, "utf8").digest();
    const kService = createHmac("sha256", kRegion).update("s3", "utf8").digest();
    return createHmac("sha256", kService).update("aws4_request", "utf8").digest();
  }

  private sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private toAmzDate(value: Date): string {
    return value.toISOString().replace(/[:-]|\.\d{3}/g, "");
  }

  private encodePathSegment(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }

  private encodeQueryComponent(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }
}
