import type { ConfigService } from "@nestjs/config";
import type { QueryResult } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { AuditService } from "../audit/audit.service";
import { MediaModerationService } from "./media-moderation.service";

function createConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
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

describe("MediaModerationService", () => {
  let queryMock: ReturnType<typeof vi.fn>;
  let auditServiceMock: AuditService;
  const mediaServiceMock = {
    createDownloadUrl: vi.fn().mockReturnValue({
      downloadUrl: "http://localhost:9000/preview.jpg",
      downloadUrlExpiresAt: "2026-03-01T00:00:00.000Z"
    })
  };

  beforeEach(() => {
    queryMock = vi.fn();
    auditServiceMock = {
      logEvent: vi.fn().mockResolvedValue(undefined)
    } as unknown as AuditService;
  });

  it("processes pending technical validation and queues AI review", async () => {
    const mediaId = "22222222-2222-4222-8222-222222222222";
    queryMock
      .mockResolvedValueOnce(
        queryResult([
          {
            id: "33333333-3333-4333-8333-333333333333",
            media_asset_id: mediaId,
            stage: "technical_validation"
          }
        ])
      )
      .mockResolvedValueOnce(queryResult([{ id: "33333333-3333-4333-8333-333333333333" }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            id: mediaId,
            owner_user_id: "11111111-1111-4111-8111-111111111111",
            job_id: null,
            kind: "image",
            bucket_name: "illamhelp-quarantine",
            object_key: "proof.jpg",
            content_type: "image/jpeg",
            file_size_bytes: 1024,
            checksum_sha256: "a".repeat(64),
            state: "scanning",
            moderation_reason_codes: [],
            ai_scores: null,
            created_at: new Date("2026-02-28T10:00:00.000Z"),
            updated_at: new Date("2026-02-28T10:00:00.000Z")
          }
        ])
      )
      .mockResolvedValue(queryResult([]));

    const service = new MediaModerationService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      mediaServiceMock as never,
      createConfigService()
    );

    const result = await service.processPendingJobs({
      limit: 5,
      actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    });

    expect(result.selected).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.technicalApproved).toBe(1);
    expect(result.technicalRejected).toBe(0);
    expect(result.errors).toBe(0);
    expect(auditServiceMock.logEvent).toHaveBeenCalled();
  });

  it("applies rejected human review decision and returns rejected media state", async () => {
    const mediaId = "44444444-4444-4444-8444-444444444444";
    const moderatorId = "55555555-5555-4555-8555-555555555555";
    const ownerUserId = "66666666-6666-4666-8666-666666666666";

    queryMock
      .mockResolvedValueOnce(
        queryResult([{ id: "77777777-7777-4777-8777-777777777777" }])
      )
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(
        queryResult([
          {
            id: mediaId,
            owner_user_id: ownerUserId,
            job_id: null,
            kind: "image",
            bucket_name: "illamhelp-quarantine",
            object_key: "proof.jpg",
            content_type: "image/jpeg",
            file_size_bytes: 2048,
            checksum_sha256: "b".repeat(64),
            state: "rejected",
            moderation_reason_codes: ["human_rejected"],
            ai_scores: null,
            created_at: new Date("2026-02-28T11:00:00.000Z"),
            updated_at: new Date("2026-02-28T11:10:00.000Z")
          }
        ])
      );

    const service = new MediaModerationService(
      { query: queryMock } as unknown as DatabaseService,
      auditServiceMock,
      mediaServiceMock as never,
      createConfigService()
    );

    const reviewed = await service.reviewMedia({
      mediaId,
      moderatorUserId: moderatorId,
      decision: "rejected",
      notes: "Contains contact number overlay"
    });

    expect(reviewed.id).toBe(mediaId);
    expect(reviewed.state).toBe("rejected");
    expect(reviewed.ownerUserId).toBe(ownerUserId);
    expect(auditServiceMock.logEvent).toHaveBeenCalledTimes(1);
  });
});
