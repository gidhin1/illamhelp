import type { ConfigService } from "@nestjs/config";
import type { QueryResult } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { InternalEventsService } from "../../common/events/internal-events.service";
import type { AuditService } from "../audit/audit.service";
import { MediaService } from "./media.service";

function createConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    MINIO_PUBLIC_ENDPOINT: "http://localhost:9000",
    MINIO_ROOT_USER: "minio",
    MINIO_ROOT_PASSWORD: "miniopassword",
    MINIO_REGION: "us-east-1",
    MINIO_QUARANTINE_BUCKET: "illamhelp-quarantine",
    MEDIA_UPLOAD_URL_TTL_SECONDS: "900",
    MEDIA_MAX_IMAGE_BYTES: "10485760",
    MEDIA_MAX_VIDEO_BYTES: "104857600",
    MEDIA_ALLOWED_IMAGE_TYPES: "image/jpeg,image/png,image/webp",
    MEDIA_ALLOWED_VIDEO_TYPES: "video/mp4,video/quicktime,video/webm",
    ...overrides
  };

  return {
    get<T>(propertyPath: string, defaultValue?: T): T {
      const value = values[propertyPath];
      return (value === undefined ? defaultValue : (value as unknown as T)) as T;
    }
  } as ConfigService;
}

function queryResult<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  } as QueryResult<T>;
}

describe("MediaService", () => {
  let queryMock: ReturnType<typeof vi.fn>;
  let auditServiceMock: AuditService;
  let internalEventsMock: InternalEventsService;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    queryMock = vi.fn();
    auditServiceMock = {
      logEvent: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuditService;
    internalEventsMock = {
      appendEvent: vi.fn().mockResolvedValue(undefined)
    } as unknown as InternalEventsService;
  });

  it("creates upload ticket with strict metadata validation", async () => {
    queryMock.mockResolvedValue(queryResult([]));

    const service = new MediaService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      internalEventsMock,
      createConfigService()
    );

    const ticket = await service.createUploadTicket({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      kind: "image",
      contentType: "image/jpeg",
      fileSizeBytes: 120000,
      checksumSha256: "a".repeat(64),
      originalFileName: "work-proof.jpg"
    });

    expect(ticket.mediaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(ticket.uploadUrl).toContain("X-Amz-Signature=");
    expect(ticket.uploadUrl).toContain("/illamhelp-quarantine/");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(auditServiceMock.logEvent).toHaveBeenCalledTimes(1);
    expect(internalEventsMock.appendEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched content type and extension", async () => {
    const service = new MediaService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      internalEventsMock,
      createConfigService()
    );

    await expect(
      service.createUploadTicket({
        ownerUserId: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        contentType: "image/png",
        fileSizeBytes: 120000,
        checksumSha256: "b".repeat(64),
        originalFileName: "work-proof.jpg"
      })
    ).rejects.toThrow("File extension does not match content type");
  });

  it("fails fast when storage credentials are missing", async () => {
    const service = new MediaService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      internalEventsMock,
      createConfigService({
        MINIO_ROOT_USER: "",
        MINIO_ROOT_PASSWORD: ""
      })
    );

    await expect(
      service.createUploadTicket({
        ownerUserId: "11111111-1111-4111-8111-111111111111",
        kind: "video",
        contentType: "video/mp4",
        fileSizeBytes: 1200000,
        checksumSha256: "c".repeat(64),
        originalFileName: "job-video.mp4"
      })
    ).rejects.toThrow("MinIO credentials are missing");
  });

  it("completes upload after verifying object metadata from storage", async () => {
    const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ownerUserId = "11111111-1111-4111-8111-111111111111";
    const createdAt = new Date("2026-02-27T10:00:00.000Z");
    const updatedAt = new Date("2026-02-27T10:01:00.000Z");

    queryMock
      .mockResolvedValueOnce(
        queryResult([
          {
            id: mediaId,
            owner_user_id: ownerUserId,
            job_id: null,
            kind: "image",
            bucket_name: "illamhelp-quarantine",
            object_key: "owner/path/proof.jpg",
            content_type: "image/jpeg",
            file_size_bytes: "512",
            checksum_sha256: "d".repeat(64),
            state: "uploaded",
            created_at: createdAt,
            updated_at: updatedAt
          }
        ])
      )
      .mockResolvedValueOnce(
        queryResult([
          {
            id: mediaId,
            owner_user_id: ownerUserId,
            job_id: null,
            kind: "image",
            bucket_name: "illamhelp-quarantine",
            object_key: "owner/path/proof.jpg",
            content_type: "image/jpeg",
            file_size_bytes: 512,
            checksum_sha256: "d".repeat(64),
            state: "scanning",
            created_at: createdAt,
            updated_at: new Date("2026-02-27T10:02:00.000Z")
          }
        ])
      );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "512",
          "x-amz-meta-checksum-sha256": "d".repeat(64),
          etag: '"abc123etag"'
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = new MediaService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      internalEventsMock,
      createConfigService()
    );

    const completed = await service.completeUpload({
      mediaId,
      ownerUserId,
      etag: "abc123etag"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(completed.id).toBe(mediaId);
    expect(completed.state).toBe("scanning");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(auditServiceMock.logEvent).toHaveBeenCalledTimes(1);
    expect(internalEventsMock.appendEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects complete upload when checksum metadata does not match", async () => {
    const mediaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ownerUserId = "11111111-1111-4111-8111-111111111111";

    queryMock.mockResolvedValueOnce(
      queryResult([
        {
          id: mediaId,
          owner_user_id: ownerUserId,
          job_id: null,
          kind: "image",
          bucket_name: "illamhelp-quarantine",
          object_key: "owner/path/proof.jpg",
          content_type: "image/jpeg",
          file_size_bytes: 256,
          checksum_sha256: "e".repeat(64),
          state: "uploaded",
          created_at: new Date("2026-02-27T10:00:00.000Z"),
          updated_at: new Date("2026-02-27T10:01:00.000Z")
        }
      ])
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "256",
          "x-amz-meta-checksum-sha256": "f".repeat(64)
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = new MediaService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      internalEventsMock,
      createConfigService()
    );

    await expect(
      service.completeUpload({
        mediaId,
        ownerUserId
      })
    ).rejects.toThrow("checksum metadata mismatch");

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.logEvent).not.toHaveBeenCalled();
    expect(internalEventsMock.appendEvent).not.toHaveBeenCalled();
  });
});
