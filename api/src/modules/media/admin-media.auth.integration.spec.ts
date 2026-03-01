import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { QueryResult, QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import { AuditService } from "../audit/audit.service";
import { AuthUserService } from "../auth/auth-user.service";
import { RolesGuard } from "../auth/guards/roles.guard";
import { KeycloakJwtGuard } from "../auth/guards/keycloak-jwt.guard";
import type { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { AdminMediaController } from "./admin-media.controller";
import { MediaModerationService } from "./media-moderation.service";

const ADMIN_USER_ID = "11111111-1111-4111-8111-111111111111";
const SEEKER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_USER_ID = "33333333-3333-4333-8333-333333333333";

const MEDIA_TECH_ID = "44444444-4444-4444-8444-444444444444";
const MEDIA_REVIEW_ID = "55555555-5555-4555-8555-555555555555";

const TECHNICAL_JOB_ID = "66666666-6666-4666-8666-666666666666";
const HUMAN_JOB_ID = "77777777-7777-4777-8777-777777777777";

const ADMIN_TOKEN = "admin-token";
const SEEKER_TOKEN = "seeker-token";

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ kid: "test-key" })),
  jwtVerify: jwtVerifyMock
}));

type MediaKind = "image" | "video";
type MediaState =
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";
type ModerationStage = "technical_validation" | "ai_review" | "human_review";
type ModerationStatus = "pending" | "running" | "approved" | "rejected" | "error";

interface MediaRow {
  id: string;
  owner_user_id: string;
  job_id: string | null;
  kind: MediaKind;
  bucket_name: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number;
  checksum_sha256: string;
  state: MediaState;
  moderation_reason_codes: string[] | null;
  ai_scores: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface ModerationJobRow {
  id: string;
  media_asset_id: string;
  stage: ModerationStage;
  status: ModerationStatus;
  assigned_moderator_user_id: string | null;
  reason_code: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
}

class InMemoryModerationDatabaseService {
  private readonly users = new Map<string, { id: string; role: string }>();
  private readonly mediaAssets = new Map<string, MediaRow>();
  private readonly moderationJobs = new Map<string, ModerationJobRow>();
  private readonly auditEvents: Array<{ eventType: string }> = [];
  private jobSequence = 1;

  constructor() {
    const baseTime = new Date("2026-02-28T10:00:00.000Z");

    this.mediaAssets.set(MEDIA_TECH_ID, {
      id: MEDIA_TECH_ID,
      owner_user_id: OWNER_USER_ID,
      job_id: null,
      kind: "image",
      bucket_name: "illamhelp-quarantine",
      object_key: "uploads/tech.jpg",
      content_type: "image/jpeg",
      file_size_bytes: 4096,
      checksum_sha256: "a".repeat(64),
      state: "uploaded",
      moderation_reason_codes: [],
      ai_scores: null,
      created_at: new Date(baseTime.getTime() - 60000),
      updated_at: new Date(baseTime.getTime() - 60000)
    });

    this.mediaAssets.set(MEDIA_REVIEW_ID, {
      id: MEDIA_REVIEW_ID,
      owner_user_id: OWNER_USER_ID,
      job_id: null,
      kind: "image",
      bucket_name: "illamhelp-quarantine",
      object_key: "uploads/review.jpg",
      content_type: "image/jpeg",
      file_size_bytes: 8192,
      checksum_sha256: "b".repeat(64),
      state: "human_review_pending",
      moderation_reason_codes: [],
      ai_scores: { nudity: 0.03, violence: 0.02 },
      created_at: new Date(baseTime.getTime() - 45000),
      updated_at: new Date(baseTime.getTime() - 45000)
    });

    this.moderationJobs.set(TECHNICAL_JOB_ID, {
      id: TECHNICAL_JOB_ID,
      media_asset_id: MEDIA_TECH_ID,
      stage: "technical_validation",
      status: "pending",
      assigned_moderator_user_id: null,
      reason_code: null,
      details: { source: "upload_ticket" },
      created_at: new Date(baseTime.getTime() - 50000),
      completed_at: null
    });

    this.moderationJobs.set(HUMAN_JOB_ID, {
      id: HUMAN_JOB_ID,
      media_asset_id: MEDIA_REVIEW_ID,
      stage: "human_review",
      status: "pending",
      assigned_moderator_user_id: null,
      reason_code: null,
      details: { source: "ai_review" },
      created_at: new Date(baseTime.getTime() - 40000),
      completed_at: null
    });
  }

  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }

  getAuditEventCount(): number {
    return this.auditEvents.length;
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const normalized = this.normalizeSql(sql);

    if (normalized.startsWith("insert into users")) {
      const userId = this.readString(params, 0);
      const role = this.readString(params, 1);
      this.users.set(userId, { id: userId, role });
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into audit_events")) {
      const eventType = this.readString(params, 2);
      this.auditEvents.push({ eventType });
      return this.result<T>([]);
    }

    if (
      normalized.includes("from moderation_jobs mj") &&
      normalized.includes("join media_assets ma on ma.id = mj.media_asset_id")
    ) {
      let parameterIndex = 0;
      let stageFilter: ModerationStage | undefined;
      let statusFilter: ModerationStatus | undefined;

      if (normalized.includes("and mj.stage = $")) {
        stageFilter = this.readStage(params, parameterIndex);
        parameterIndex += 1;
      }
      if (normalized.includes("and mj.status = $")) {
        statusFilter = this.readStatus(params, parameterIndex);
        parameterIndex += 1;
      }
      const limit = this.readNumber(params, params.length - 1, 50);

      const rows = [...this.moderationJobs.values()]
        .filter((job) => job.stage === "human_review")
        .filter((job) => (stageFilter ? job.stage === stageFilter : true))
        .filter((job) => (statusFilter ? job.status === statusFilter : true))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .slice(0, limit)
        .map((job) => {
          const media = this.getMedia(job.media_asset_id);
          return {
            moderation_job_id: job.id,
            media_id: media.id,
            stage: job.stage,
            status: job.status,
            reason_code: job.reason_code,
            moderation_created_at: job.created_at,
            media_state: media.state,
            owner_user_id: media.owner_user_id,
            kind: media.kind,
            content_type: media.content_type,
            file_size_bytes: media.file_size_bytes
          };
        });

      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.startsWith("select id, media_asset_id, stage from moderation_jobs") &&
      normalized.includes("stage in ('technical_validation'::moderation_stage, 'ai_review'::moderation_stage)")
    ) {
      const limit = this.readNumber(params, 0, 10);
      const rows = [...this.moderationJobs.values()]
        .filter((job) => job.status === "pending")
        .filter((job) => job.stage === "technical_validation" || job.stage === "ai_review")
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .slice(0, limit)
        .map((job) => ({
          id: job.id,
          media_asset_id: job.media_asset_id,
          stage: job.stage
        }));

      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.startsWith("update moderation_jobs") &&
      normalized.includes("set status = 'running'::moderation_status")
    ) {
      const jobId = this.readString(params, 0);
      const job = this.moderationJobs.get(jobId);
      if (!job || job.status !== "pending") {
        return this.result<T>([]);
      }
      job.status = "running";
      this.moderationJobs.set(job.id, job);
      return this.result<T>([{ id: job.id } as unknown as T]);
    }

    if (
      normalized.startsWith("select id, owner_user_id, job_id") &&
      normalized.includes("from media_assets") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const mediaId = this.readString(params, 0);
      const media = this.mediaAssets.get(mediaId);
      if (!media) {
        return this.result<T>([]);
      }
      return this.result<T>([media as unknown as T]);
    }

    if (
      normalized.startsWith("update moderation_jobs") &&
      normalized.includes("set status = 'approved'::moderation_status") &&
      normalized.includes("where id = $1::uuid")
    ) {
      const jobId = this.readString(params, 0);
      const details = this.readJsonObject(params, 1);
      const job = this.getJob(jobId);
      job.status = "approved";
      job.details = {
        ...(job.details ?? {}),
        ...details
      };
      job.completed_at = new Date();
      this.moderationJobs.set(job.id, job);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("insert into moderation_jobs") &&
      normalized.includes("'ai_review'::moderation_stage")
    ) {
      const mediaId = this.readString(params, 0);
      const details = this.readJsonObject(params, 1);
      const newJob = this.newModerationJob({
        mediaAssetId: mediaId,
        stage: "ai_review",
        status: "pending",
        details
      });
      this.moderationJobs.set(newJob.id, newJob);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("insert into moderation_jobs") &&
      normalized.includes("'human_review'::moderation_stage")
    ) {
      const mediaId = this.readString(params, 0);
      const details = this.readJsonObject(params, 1);
      const newJob = this.newModerationJob({
        mediaAssetId: mediaId,
        stage: "human_review",
        status: "pending",
        details
      });
      this.moderationJobs.set(newJob.id, newJob);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("update media_assets") &&
      normalized.includes("set state = 'scanning'::media_state")
    ) {
      const mediaId = this.readString(params, 0);
      const media = this.getMedia(mediaId);
      media.state = "scanning";
      media.updated_at = new Date();
      this.mediaAssets.set(media.id, media);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("update media_assets") &&
      normalized.includes("set state = 'human_review_pending'::media_state")
    ) {
      const mediaId = this.readString(params, 0);
      const aiScores = this.readJsonObject(params, 1);
      const reasonCodes = this.readStringArray(params, 2);
      const media = this.getMedia(mediaId);
      media.state = "human_review_pending";
      media.ai_scores = aiScores;
      media.moderation_reason_codes = [...new Set([...(media.moderation_reason_codes ?? []), ...reasonCodes])];
      media.updated_at = new Date();
      this.mediaAssets.set(media.id, media);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("select id from moderation_jobs") &&
      normalized.includes("where media_asset_id = $1::uuid") &&
      normalized.includes("stage = 'human_review'::moderation_stage") &&
      normalized.includes("status = 'pending'::moderation_status")
    ) {
      const mediaId = this.readString(params, 0);
      const job = [...this.moderationJobs.values()]
        .filter((row) => row.media_asset_id === mediaId)
        .filter((row) => row.stage === "human_review" && row.status === "pending")
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];

      return job
        ? this.result<T>([{ id: job.id } as unknown as T])
        : this.result<T>([]);
    }

    if (
      normalized.startsWith("update moderation_jobs") &&
      normalized.includes("set status = $2::moderation_status")
    ) {
      const jobId = this.readString(params, 0);
      const status = this.readStatus(params, 1);
      const assignedModeratorId = this.readNullableString(params, 2);
      const reasonCode = this.readNullableString(params, 3);
      const details = this.readJsonObject(params, 4);
      const job = this.getJob(jobId);
      job.status = status;
      job.assigned_moderator_user_id = assignedModeratorId;
      job.reason_code = reasonCode;
      job.details = {
        ...(job.details ?? {}),
        ...details
      };
      job.completed_at = new Date();
      this.moderationJobs.set(job.id, job);
      return this.result<T>([]);
    }

    if (
      normalized.startsWith("update media_assets") &&
      normalized.includes("set state = $2::media_state") &&
      normalized.includes("returning")
    ) {
      const mediaId = this.readString(params, 0);
      const state = this.readMediaState(params, 1);
      const reasonCode = this.readNullableString(params, 2);
      const media = this.getMedia(mediaId);
      media.state = state;
      if (reasonCode) {
        media.moderation_reason_codes = [
          ...new Set([...(media.moderation_reason_codes ?? []), reasonCode])
        ];
      }
      media.updated_at = new Date();
      this.mediaAssets.set(media.id, media);
      return this.result<T>([media as unknown as T]);
    }

    if (
      normalized.startsWith("select id, media_asset_id, stage, status") &&
      normalized.includes("from moderation_jobs") &&
      normalized.includes("where media_asset_id = $1::uuid")
    ) {
      const mediaId = this.readString(params, 0);
      const rows = [...this.moderationJobs.values()]
        .filter((job) => job.media_asset_id === mediaId)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
      return this.result<T>(rows as unknown as T[]);
    }

    if (
      normalized.startsWith("update moderation_jobs") &&
      normalized.includes("set status = 'error'::moderation_status")
    ) {
      const jobId = this.readString(params, 0);
      const reasonCode = this.readNullableString(params, 1);
      const details = this.readJsonObject(params, 2);
      const job = this.getJob(jobId);
      job.status = "error";
      job.reason_code = reasonCode;
      job.details = {
        ...(job.details ?? {}),
        ...details
      };
      job.completed_at = new Date();
      this.moderationJobs.set(job.id, job);
      return this.result<T>([]);
    }

    throw new Error(`Unhandled SQL in admin media integration test DB: ${normalized}`);
  }

  private normalizeSql(sql: string): string {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  private result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
    return {
      command: "SELECT",
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows
    } as QueryResult<T>;
  }

  private getMedia(mediaId: string): MediaRow {
    const media = this.mediaAssets.get(mediaId);
    if (!media) {
      throw new Error(`Media not found in test DB: ${mediaId}`);
    }
    return media;
  }

  private getJob(jobId: string): ModerationJobRow {
    const job = this.moderationJobs.get(jobId);
    if (!job) {
      throw new Error(`Moderation job not found in test DB: ${jobId}`);
    }
    return job;
  }

  private readString(values: unknown[], index: number): string {
    const value = values[index];
    if (typeof value !== "string") {
      throw new Error(`Expected string at params[${index}]`);
    }
    return value;
  }

  private readNullableString(values: unknown[], index: number): string | null {
    const value = values[index];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error(`Expected nullable string at params[${index}]`);
    }
    return value;
  }

  private readNumber(values: unknown[], index: number, fallback: number): number {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
    return fallback;
  }

  private readJsonObject(values: unknown[], index: number): Record<string, unknown> {
    const raw = values[index];
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  }

  private readStringArray(values: unknown[], index: number): string[] {
    const raw = values[index];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((entry): entry is string => typeof entry === "string");
  }

  private readStage(values: unknown[], index: number): ModerationStage {
    const stage = this.readString(values, index);
    if (
      stage !== "technical_validation" &&
      stage !== "ai_review" &&
      stage !== "human_review"
    ) {
      throw new Error(`Unsupported stage in test DB: ${stage}`);
    }
    return stage;
  }

  private readStatus(values: unknown[], index: number): ModerationStatus {
    const status = this.readString(values, index);
    if (
      status !== "pending" &&
      status !== "running" &&
      status !== "approved" &&
      status !== "rejected" &&
      status !== "error"
    ) {
      throw new Error(`Unsupported status in test DB: ${status}`);
    }
    return status;
  }

  private readMediaState(values: unknown[], index: number): MediaState {
    const state = this.readString(values, index);
    if (
      state !== "uploaded" &&
      state !== "scanning" &&
      state !== "ai_reviewed" &&
      state !== "human_review_pending" &&
      state !== "approved" &&
      state !== "rejected" &&
      state !== "appeal_pending" &&
      state !== "appeal_resolved"
    ) {
      throw new Error(`Unsupported media state in test DB: ${state}`);
    }
    return state;
  }

  private newModerationJob(input: {
    mediaAssetId: string;
    stage: ModerationStage;
    status: ModerationStatus;
    details: Record<string, unknown>;
  }): ModerationJobRow {
    this.jobSequence += 1;
    const suffix = this.jobSequence.toString().padStart(12, "0");
    return {
      id: `99999999-9999-4999-8999-${suffix}`,
      media_asset_id: input.mediaAssetId,
      stage: input.stage,
      status: input.status,
      assigned_moderator_user_id: null,
      reason_code: null,
      details: input.details,
      created_at: new Date(),
      completed_at: null
    };
  }
}

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    KEYCLOAK_URL: "http://localhost:8080",
    KEYCLOAK_REALM: "illamhelp",
    KEYCLOAK_CLIENT_ID: "illamhelp-api",
    MEDIA_MAX_IMAGE_BYTES: "10485760",
    MEDIA_MAX_VIDEO_BYTES: "104857600",
    MEDIA_ALLOWED_IMAGE_TYPES: "image/jpeg,image/png,image/webp",
    MEDIA_ALLOWED_VIDEO_TYPES: "video/mp4,video/quicktime,video/webm"
  };

  return {
    get<T>(propertyPath: string, defaultValue?: T): T {
      const value = values[propertyPath];
      return (value === undefined ? defaultValue : (value as unknown as T)) as T;
    }
  } as ConfigService;
}

function buildExecutionContext(
  request: {
    headers: Record<string, string | undefined>;
    user?: AuthenticatedUser;
  },
  handler: (...args: unknown[]) => unknown
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: () => handler,
    getClass: () => AdminMediaController
  } as unknown as ExecutionContext;
}

describe("Admin media auth + moderation integration", () => {
  let database: InMemoryModerationDatabaseService;
  let authGuard: KeycloakJwtGuard;
  let rolesGuard: RolesGuard;
  let controller: AdminMediaController;

  const listQueueHandler = AdminMediaController.prototype.listModerationQueue as (
    ...args: unknown[]
  ) => unknown;
  const processBatchHandler = AdminMediaController.prototype.processModerationBatch as (
    ...args: unknown[]
  ) => unknown;
  const reviewMediaHandler = AdminMediaController.prototype.reviewMedia as (
    ...args: unknown[]
  ) => unknown;

  beforeEach(() => {
    jwtVerifyMock.mockReset();
    jwtVerifyMock.mockImplementation(async (token: string) => {
      if (token === ADMIN_TOKEN) {
        return {
          payload: {
            sub: ADMIN_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["admin"] }
          }
        };
      }

      if (token === SEEKER_TOKEN) {
        return {
          payload: {
            sub: SEEKER_USER_ID,
            aud: "illamhelp-api",
            azp: "illamhelp-api",
            realm_access: { roles: ["seeker"] }
          }
        };
      }

      throw new UnauthorizedException("Invalid token");
    });

    database = new InMemoryModerationDatabaseService();
    const databaseService = database as unknown as DatabaseService;
    const configService = createConfigService();
    const auditService = new AuditService(databaseService);
    const mediaService = {
      createDownloadUrl: () => ({
        downloadUrl: "http://localhost:9000/illamhelp-quarantine/uploads/review.jpg",
        downloadUrlExpiresAt: "2026-03-01T00:00:00.000Z"
      })
    };
    const moderationService = new MediaModerationService(
      databaseService,
      auditService,
      mediaService as never,
      configService
    );

    controller = new AdminMediaController(moderationService);
    authGuard = new KeycloakJwtGuard(
      configService,
      new Reflector(),
      new AuthUserService(databaseService)
    );
    rolesGuard = new RolesGuard(new Reflector());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("denies moderation queue access for non-admin user token", async () => {
    const request = {
      headers: {
        authorization: `Bearer ${SEEKER_TOKEN}`
      }
    } as {
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    };
    const context = buildExecutionContext(request, listQueueHandler);

    await expect(authGuard.canActivate(context)).resolves.toBe(true);
    expect(database.hasUser(SEEKER_USER_ID)).toBe(true);

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows admin to list moderation queue", async () => {
    const adminUser = await authenticateAndAuthorize(authGuard, rolesGuard, ADMIN_TOKEN, listQueueHandler);

    const queue = await controller.listModerationQueue({
      status: "pending",
      limit: 10
    });

    expect(adminUser.userId).toBe(ADMIN_USER_ID);
    expect(database.hasUser(ADMIN_USER_ID)).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      mediaId: MEDIA_REVIEW_ID,
      stage: "human_review",
      status: "pending"
    });
  });

  it("processes pending technical jobs through admin batch endpoint", async () => {
    const adminUser = await authenticateAndAuthorize(
      authGuard,
      rolesGuard,
      ADMIN_TOKEN,
      processBatchHandler
    );

    const summary = await controller.processModerationBatch({ limit: 1 }, adminUser);

    expect(summary).toEqual({
      selected: 1,
      processed: 1,
      technicalApproved: 1,
      technicalRejected: 0,
      aiCompleted: 0,
      errors: 0
    });

    const details = await controller.getModerationDetails(MEDIA_TECH_ID);
    const technicalJob = details.moderationJobs.find(
      (job) => job.stage === "technical_validation"
    );
    const aiJob = details.moderationJobs.find((job) => job.stage === "ai_review");

    expect(details.media.state).toBe("scanning");
    expect(technicalJob?.status).toBe("approved");
    expect(aiJob?.status).toBe("pending");
    expect(database.getAuditEventCount()).toBeGreaterThan(0);
  });

  it("allows admin to approve media in human review", async () => {
    const adminUser = await authenticateAndAuthorize(
      authGuard,
      rolesGuard,
      ADMIN_TOKEN,
      reviewMediaHandler
    );

    const updated = await controller.reviewMedia(
      MEDIA_REVIEW_ID,
      {
        decision: "approved",
        notes: "Looks acceptable for public profile"
      },
      adminUser
    );

    expect(updated.id).toBe(MEDIA_REVIEW_ID);
    expect(updated.state).toBe("approved");

    const details = await controller.getModerationDetails(MEDIA_REVIEW_ID);
    const humanJob = details.moderationJobs.find((job) => job.stage === "human_review");

    expect(humanJob?.status).toBe("approved");
    expect(humanJob?.assignedModeratorUserId).toBe(ADMIN_USER_ID);
  });
});

async function authenticateAndAuthorize(
  authGuard: KeycloakJwtGuard,
  rolesGuard: RolesGuard,
  token: string,
  handler: (...args: unknown[]) => unknown
): Promise<AuthenticatedUser> {
  const request = {
    headers: {
      authorization: `Bearer ${token}`
    }
  } as {
    headers: Record<string, string | undefined>;
    user?: AuthenticatedUser;
  };
  const context = buildExecutionContext(request, handler);

  const authenticated = await authGuard.canActivate(context);
  expect(authenticated).toBe(true);
  const authorized = rolesGuard.canActivate(context);
  expect(authorized).toBe(true);
  expect(request.user).toBeDefined();

  return request.user as AuthenticatedUser;
}
