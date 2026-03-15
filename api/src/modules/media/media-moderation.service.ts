import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { AuditService } from "../audit/audit.service";
import { MediaAssetRecord, MediaService } from "./media.service";

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

type HumanReviewDecision = "approved" | "rejected";

interface DbModerationQueueRow {
  moderation_job_id: string;
  media_id: string;
  stage: ModerationStage;
  status: ModerationStatus;
  reason_code: string | null;
  moderation_created_at: Date;
  media_state: MediaState;
  owner_user_id: string;
  kind: "image" | "video";
  context: "profile_gallery" | "profile_avatar" | "job_attachment" | "verification_document";
  content_type: string;
  file_size_bytes: number | string;
}

interface DbModerationJobRow {
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

interface DbMediaRow {
  id: string;
  owner_user_id: string;
  job_id: string | null;
  kind: "image" | "video";
  context: "profile_gallery" | "profile_avatar" | "job_attachment" | "verification_document";
  bucket_name: string;
  object_key: string;
  content_type: string;
  file_size_bytes: number | string;
  checksum_sha256: string;
  state: MediaState;
  moderation_reason_codes: string[] | null;
  ai_scores: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface ModerationQueueItem {
  moderationJobId: string;
  mediaId: string;
  stage: ModerationStage;
  status: ModerationStatus;
  reasonCode: string | null;
  moderationCreatedAt: string;
  mediaState: MediaState;
  ownerUserId: string;
  kind: "image" | "video";
  context: "profile_gallery" | "profile_avatar" | "job_attachment" | "verification_document";
  contentType: string;
  fileSizeBytes: number;
}

export interface ModerationJobRecord {
  id: string;
  mediaAssetId: string;
  stage: ModerationStage;
  status: ModerationStatus;
  assignedModeratorUserId: string | null;
  reasonCode: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface MediaModerationDetails {
  media: MediaAssetRecord & {
    moderationReasonCodes: string[];
    aiScores: Record<string, unknown> | null;
    previewUrl: string;
    previewUrlExpiresAt: string;
  };
  moderationJobs: ModerationJobRecord[];
}

export interface ModerationBatchResult {
  selected: number;
  processed: number;
  technicalApproved: number;
  technicalRejected: number;
  aiCompleted: number;
  errors: number;
}

interface ProcessPendingJobsInput {
  limit: number;
  actorUserId?: string;
}

interface ReviewMediaInput {
  mediaId: string;
  moderatorUserId: string;
  decision: HumanReviewDecision;
  reasonCode?: string;
  notes?: string;
}

@Injectable()
export class MediaModerationService {
  private readonly maxImageBytes: number;
  private readonly maxVideoBytes: number;
  private readonly allowedImageTypes: Set<string>;
  private readonly allowedVideoTypes: Set<string>;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly mediaService: MediaService,
    configService: ConfigService
  ) {
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
  }

  async listModerationQueue(input: {
    stage?: ModerationStage;
    status?: ModerationStatus;
    limit: number;
  }): Promise<ModerationQueueItem[]> {
    const limit = this.clampLimit(input.limit, 50);

    const values: Array<string | number> = [];
    let whereSql = "WHERE mj.stage = 'human_review'::moderation_stage";
    if (input.stage) {
      values.push(input.stage);
      whereSql += ` AND mj.stage = $${values.length}::moderation_stage`;
    }
    if (input.status) {
      values.push(input.status);
      whereSql += ` AND mj.status = $${values.length}::moderation_status`;
    }
    values.push(limit);

    const result = await this.databaseService.query<DbModerationQueueRow>(
      `
      SELECT
        mj.id AS moderation_job_id,
        mj.media_asset_id AS media_id,
        mj.stage,
        mj.status,
        mj.reason_code,
        mj.created_at AS moderation_created_at,
        ma.state AS media_state,
        ma.owner_user_id,
        ma.kind,
        ma.context,
        ma.content_type,
        ma.file_size_bytes
      FROM moderation_jobs mj
      JOIN media_assets ma ON ma.id = mj.media_asset_id
      ${whereSql}
      ORDER BY mj.created_at ASC
      LIMIT $${values.length}::int
      `,
      values
    );

    return result.rows.map((row) => ({
      moderationJobId: row.moderation_job_id,
      mediaId: row.media_id,
      stage: row.stage,
      status: row.status,
      reasonCode: row.reason_code,
      moderationCreatedAt: row.moderation_created_at.toISOString(),
      mediaState: row.media_state,
      ownerUserId: row.owner_user_id,
      kind: row.kind,
      context: row.context,
      contentType: row.content_type,
      fileSizeBytes: this.parsePositiveInt(row.file_size_bytes, 0)
    }));
  }

  async getModerationDetails(mediaId: string): Promise<MediaModerationDetails> {
    assertUuid(mediaId, "mediaId");

    const mediaResult = await this.databaseService.query<DbMediaRow>(
      `
      SELECT
        id,
        owner_user_id,
        job_id,
        kind,
        context,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        moderation_reason_codes,
        ai_scores,
        created_at,
        updated_at
      FROM media_assets
      WHERE id = $1::uuid
      `,
      [mediaId]
    );

    if (!mediaResult.rowCount) {
      throw new NotFoundException("Media asset not found");
    }

    const jobsResult = await this.databaseService.query<DbModerationJobRow>(
      `
      SELECT
        id,
        media_asset_id,
        stage,
        status,
        assigned_moderator_user_id,
        reason_code,
        details,
        created_at,
        completed_at
      FROM moderation_jobs
      WHERE media_asset_id = $1::uuid
      ORDER BY created_at ASC
      `,
      [mediaId]
    );

    const media = mediaResult.rows[0];
    const signedPreview = this.mediaService.createDownloadUrl({
      bucketName: media.bucket_name,
      objectKey: media.object_key
    });

    return {
      media: {
        id: media.id,
        ownerUserId: media.owner_user_id,
        jobId: media.job_id,
        kind: media.kind,
        context: media.context,
        bucketName: media.bucket_name,
        objectKey: media.object_key,
        contentType: media.content_type,
        fileSizeBytes: this.parsePositiveInt(media.file_size_bytes, 0),
        checksumSha256: media.checksum_sha256,
        state: media.state,
        createdAt: media.created_at.toISOString(),
        updatedAt: media.updated_at.toISOString(),
        moderationReasonCodes: media.moderation_reason_codes ?? [],
        aiScores: media.ai_scores ?? null,
        previewUrl: signedPreview.downloadUrl,
        previewUrlExpiresAt: signedPreview.downloadUrlExpiresAt
      },
      moderationJobs: jobsResult.rows.map((job) => ({
        id: job.id,
        mediaAssetId: job.media_asset_id,
        stage: job.stage,
        status: job.status,
        assignedModeratorUserId: job.assigned_moderator_user_id,
        reasonCode: job.reason_code,
        details: job.details ?? {},
        createdAt: job.created_at.toISOString(),
        completedAt: job.completed_at ? job.completed_at.toISOString() : null
      }))
    };
  }

  async processPendingJobs(input: ProcessPendingJobsInput): Promise<ModerationBatchResult> {
    const limit = this.clampLimit(input.limit, 10);

    const pendingResult = await this.databaseService.query<{
      id: string;
      media_asset_id: string;
      stage: ModerationStage;
    }>(
      `
      SELECT id, media_asset_id, stage
      FROM moderation_jobs
      WHERE status = 'pending'::moderation_status
        AND stage IN ('technical_validation'::moderation_stage, 'ai_review'::moderation_stage)
      ORDER BY created_at ASC
      LIMIT $1::int
      `,
      [limit]
    );

    const summary: ModerationBatchResult = {
      selected: pendingResult.rows.length,
      processed: 0,
      technicalApproved: 0,
      technicalRejected: 0,
      aiCompleted: 0,
      errors: 0
    };

    for (const job of pendingResult.rows) {
      const claimed = await this.databaseService.query<{ id: string }>(
        `
        UPDATE moderation_jobs
        SET status = 'running'::moderation_status
        WHERE id = $1::uuid
          AND status = 'pending'::moderation_status
        RETURNING id
        `,
        [job.id]
      );

      if (!claimed.rowCount) {
        continue;
      }

      try {
        if (job.stage === "technical_validation") {
          const technical = await this.processTechnicalValidationJob(job.id, job.media_asset_id);
          summary.processed += 1;
          if (technical === "approved") {
            summary.technicalApproved += 1;
          } else {
            summary.technicalRejected += 1;
          }
          continue;
        }

        if (job.stage === "ai_review") {
          await this.processAiReviewJob(job.id, job.media_asset_id);
          summary.processed += 1;
          summary.aiCompleted += 1;
          continue;
        }
      } catch {
        summary.errors += 1;
        await this.markJobError(job.id, "processing_error", {
          stage: job.stage
        });
      }
    }

    if (input.actorUserId) {
      await this.auditService.logEvent({
        actorUserId: input.actorUserId,
        targetUserId: input.actorUserId,
        eventType: "media_moderation_batch_processed",
        metadata: {
          selected: summary.selected,
          processed: summary.processed,
          technicalApproved: summary.technicalApproved,
          technicalRejected: summary.technicalRejected,
          aiCompleted: summary.aiCompleted,
          errors: summary.errors
        }
      });
    }

    return summary;
  }

  async reviewMedia(input: ReviewMediaInput): Promise<MediaAssetRecord> {
    assertUuid(input.mediaId, "mediaId");
    assertUuid(input.moderatorUserId, "moderatorUserId");

    const pendingHumanReview = await this.databaseService.query<{
      id: string;
    }>(
      `
      SELECT id
      FROM moderation_jobs
      WHERE media_asset_id = $1::uuid
        AND stage = 'human_review'::moderation_stage
        AND status = 'pending'::moderation_status
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [input.mediaId]
    );

    if (!pendingHumanReview.rowCount) {
      throw new NotFoundException("No pending human review found for media asset");
    }

    const moderationJobId = pendingHumanReview.rows[0].id;
    const decisionStatus: ModerationStatus =
      input.decision === "approved" ? "approved" : "rejected";
    const nextMediaState: MediaState =
      input.decision === "approved" ? "approved" : "rejected";
    const reasonCode = input.decision === "rejected" ? input.reasonCode ?? "human_rejected" : null;

    await this.databaseService.query(
      `
      UPDATE moderation_jobs
      SET
        status = $2::moderation_status,
        assigned_moderator_user_id = $3::uuid,
        reason_code = $4::text,
        details = COALESCE(details, '{}'::jsonb) || $5::jsonb,
        completed_at = now()
      WHERE id = $1::uuid
      `,
      [
        moderationJobId,
        decisionStatus,
        input.moderatorUserId,
        reasonCode,
        JSON.stringify({
          decision: input.decision,
          notes: input.notes ?? null,
          reviewedBy: input.moderatorUserId
        })
      ]
    );

    const mediaResult = await this.databaseService.query<DbMediaRow>(
      `
      UPDATE media_assets
      SET
        state = $2::media_state,
        moderation_reason_codes = CASE
          WHEN $3::text IS NULL THEN moderation_reason_codes
          WHEN moderation_reason_codes @> ARRAY[$3::text]::text[] THEN moderation_reason_codes
          ELSE array_append(moderation_reason_codes, $3::text)
        END,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        owner_user_id,
        job_id,
        kind,
        context,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        moderation_reason_codes,
        ai_scores,
        created_at,
        updated_at
      `,
      [input.mediaId, nextMediaState, reasonCode]
    );

    if (!mediaResult.rowCount) {
      throw new NotFoundException("Media asset not found");
    }

    const media = mediaResult.rows[0];
    if (input.decision === "approved" && media.context === "profile_avatar") {
      await this.databaseService.query(
        `
        UPDATE profiles
        SET active_avatar_media_id = $2::uuid,
            updated_at = now()
        WHERE user_id = $1::uuid
        `,
        [media.owner_user_id, media.id]
      );
    }
    await this.auditService.logEvent({
      actorUserId: input.moderatorUserId,
      targetUserId: media.owner_user_id,
      eventType: "media_human_review_decided",
      metadata: {
        mediaId: input.mediaId,
        moderationJobId,
        decision: input.decision,
        context: media.context,
        reasonCode,
        notes: input.notes ?? null
      }
    });

    return {
      id: media.id,
      ownerUserId: media.owner_user_id,
      jobId: media.job_id,
      kind: media.kind,
      context: media.context,
      bucketName: media.bucket_name,
      objectKey: media.object_key,
      contentType: media.content_type,
      fileSizeBytes: this.parsePositiveInt(media.file_size_bytes, 0),
      checksumSha256: media.checksum_sha256,
      state: media.state,
      createdAt: media.created_at.toISOString(),
      updatedAt: media.updated_at.toISOString()
    };
  }

  private async processTechnicalValidationJob(
    moderationJobId: string,
    mediaId: string
  ): Promise<"approved" | "rejected"> {
    const mediaResult = await this.databaseService.query<DbMediaRow>(
      `
      SELECT
        id,
        owner_user_id,
        job_id,
        kind,
        context,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        moderation_reason_codes,
        ai_scores,
        created_at,
        updated_at
      FROM media_assets
      WHERE id = $1::uuid
      `,
      [mediaId]
    );

    if (!mediaResult.rowCount) {
      await this.markJobError(moderationJobId, "media_not_found", { mediaId });
      return "rejected";
    }

    const media = mediaResult.rows[0];
    const fileSizeBytes = this.parsePositiveInt(media.file_size_bytes, 0);
    const allowedContentTypes =
      media.kind === "image" ? this.allowedImageTypes : this.allowedVideoTypes;
    const maxSize = media.kind === "image" ? this.maxImageBytes : this.maxVideoBytes;
    const reasonCodes: string[] = [];

    if (!allowedContentTypes.has(media.content_type)) {
      reasonCodes.push("technical_unsupported_content_type");
    }
    if (fileSizeBytes <= 0 || fileSizeBytes > maxSize) {
      reasonCodes.push("technical_size_out_of_bounds");
    }

    if (reasonCodes.length > 0) {
      const primaryReason = reasonCodes[0];
      await this.databaseService.query(
        `
        UPDATE moderation_jobs
        SET
          status = 'rejected'::moderation_status,
          reason_code = $2::text,
          details = COALESCE(details, '{}'::jsonb) || $3::jsonb,
          completed_at = now()
        WHERE id = $1::uuid
        `,
        [
          moderationJobId,
          primaryReason,
          JSON.stringify({
            reasonCodes,
            checkedContentType: media.content_type,
            checkedFileSizeBytes: fileSizeBytes
          })
        ]
      );

      await this.databaseService.query(
        `
        UPDATE media_assets
        SET
          state = 'rejected'::media_state,
          moderation_reason_codes = (
            SELECT ARRAY(
              SELECT DISTINCT reason
              FROM unnest(COALESCE(moderation_reason_codes, '{}'::text[]) || $2::text[]) AS reason
            )
          ),
          updated_at = now()
        WHERE id = $1::uuid
        `,
        [mediaId, reasonCodes]
      );

      await this.auditService.logEvent({
        targetUserId: media.owner_user_id,
        eventType: "media_technical_validation_rejected",
        metadata: {
          actor: "system",
          mediaId,
          moderationJobId,
          reasonCodes
        }
      });

      return "rejected";
    }

    await this.databaseService.query(
      `
      UPDATE moderation_jobs
      SET
        status = 'approved'::moderation_status,
        details = COALESCE(details, '{}'::jsonb) || $2::jsonb,
        completed_at = now()
      WHERE id = $1::uuid
      `,
      [
        moderationJobId,
        JSON.stringify({
          checks: {
            contentType: "ok",
            fileSizeBytes: "ok"
          }
        })
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
        'ai_review'::moderation_stage,
        'pending'::moderation_status,
        $2::jsonb
      )
      `,
      [
        mediaId,
        JSON.stringify({
          source: "technical_validation",
          previousJobId: moderationJobId
        })
      ]
    );

    await this.databaseService.query(
      `
      UPDATE media_assets
      SET state = 'scanning'::media_state,
          updated_at = now()
      WHERE id = $1::uuid
      `,
      [mediaId]
    );

    await this.auditService.logEvent({
      targetUserId: media.owner_user_id,
      eventType: "media_technical_validation_passed",
      metadata: {
        actor: "system",
        mediaId,
        moderationJobId
      }
    });

    return "approved";
  }

  private async processAiReviewJob(
    moderationJobId: string,
    mediaId: string
  ): Promise<void> {
    const mediaResult = await this.databaseService.query<DbMediaRow>(
      `
      SELECT
        id,
        owner_user_id,
        job_id,
        kind,
        context,
        bucket_name,
        object_key,
        content_type,
        file_size_bytes,
        checksum_sha256,
        state,
        moderation_reason_codes,
        ai_scores,
        created_at,
        updated_at
      FROM media_assets
      WHERE id = $1::uuid
      `,
      [mediaId]
    );

    if (!mediaResult.rowCount) {
      await this.markJobError(moderationJobId, "media_not_found", { mediaId });
      return;
    }

    const media = mediaResult.rows[0];
    const scores = this.buildAiScores(media);
    const aiReasonCodes = this.aiReasonCodes(scores);

    await this.databaseService.query(
      `
      UPDATE moderation_jobs
      SET
        status = 'approved'::moderation_status,
        details = COALESCE(details, '{}'::jsonb) || $2::jsonb,
        completed_at = now()
      WHERE id = $1::uuid
      `,
      [
        moderationJobId,
        JSON.stringify({
          aiScores: scores,
          reasonCodes: aiReasonCodes
        })
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
        'human_review'::moderation_stage,
        'pending'::moderation_status,
        $2::jsonb
      )
      `,
      [
        mediaId,
        JSON.stringify({
          source: "ai_review",
          previousJobId: moderationJobId,
          aiScores: scores,
          reasonCodes: aiReasonCodes
        })
      ]
    );

    await this.databaseService.query(
      `
      UPDATE media_assets
      SET
        state = 'human_review_pending'::media_state,
        ai_scores = $2::jsonb,
        moderation_reason_codes = (
          SELECT ARRAY(
            SELECT DISTINCT reason
            FROM unnest(COALESCE(moderation_reason_codes, '{}'::text[]) || $3::text[]) AS reason
          )
        ),
        updated_at = now()
      WHERE id = $1::uuid
      `,
      [mediaId, JSON.stringify(scores), aiReasonCodes]
    );

    await this.auditService.logEvent({
      targetUserId: media.owner_user_id,
      eventType: "media_ai_review_completed",
      metadata: {
        mediaId,
        moderationJobId,
        aiScores: scores,
        reasonCodes: aiReasonCodes
      }
    });
  }

  private buildAiScores(media: DbMediaRow): Record<string, number> {
    const fileSizeBytes = this.parsePositiveInt(media.file_size_bytes, 0);
    const maxBytes = media.kind === "image" ? this.maxImageBytes : this.maxVideoBytes;
    const sizeRisk = Math.min(1, Math.max(0, fileSizeBytes / maxBytes));
    const key = `${media.object_key}|${media.content_type}`.toLowerCase();
    const keywordRisk = /(whatsapp|telegram|phone|contact|call-now|email|number)/.test(key)
      ? 0.85
      : 0.12;

    return {
      professionalRelevance: 0.82,
      adultSexualRisk: Number((0.03 + sizeRisk * 0.1).toFixed(3)),
      violenceRisk: Number((0.02 + sizeRisk * 0.08).toFixed(3)),
      spamContactLeakageRisk: Number((Math.max(keywordRisk, sizeRisk * 0.45)).toFixed(3))
    };
  }

  private aiReasonCodes(scores: Record<string, number>): string[] {
    const reasons: string[] = [];
    if ((scores.spamContactLeakageRisk ?? 0) >= 0.7) {
      reasons.push("ai_contact_leakage_high");
    }
    if ((scores.adultSexualRisk ?? 0) >= 0.7) {
      reasons.push("ai_adult_content_high");
    }
    if ((scores.violenceRisk ?? 0) >= 0.7) {
      reasons.push("ai_violence_risk_high");
    }
    return reasons;
  }

  private async markJobError(
    moderationJobId: string,
    reasonCode: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.databaseService.query(
      `
      UPDATE moderation_jobs
      SET
        status = 'error'::moderation_status,
        reason_code = $2::text,
        details = COALESCE(details, '{}'::jsonb) || $3::jsonb,
        completed_at = now()
      WHERE id = $1::uuid
      `,
      [moderationJobId, reasonCode, JSON.stringify(details)]
    );
  }

  private clampLimit(limit: number, fallback: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return fallback;
    }
    return Math.min(Math.trunc(limit), 200);
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
}
