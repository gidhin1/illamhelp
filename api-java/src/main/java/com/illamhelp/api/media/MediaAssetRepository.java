package com.illamhelp.api.media;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> {
  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", job_id AS "jobId", kind::text, bucket_name AS "bucketName",
             object_key AS "objectKey", content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE owner_user_id = cast(:userId as uuid) ORDER BY created_at DESC
      """, nativeQuery = true)
  List<Map<String, Object>> listMine(@Param("userId") String userId);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", job_id AS "jobId", kind::text, bucket_name, object_key,
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", state::text,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE owner_user_id = cast(:ownerUserId as uuid) AND state = 'approved'
      ORDER BY created_at DESC
      """, nativeQuery = true)
  List<Map<String, Object>> listApprovedForOwner(@Param("ownerUserId") String ownerUserId);

  @Modifying
  @Query(value = """
      INSERT INTO media_assets (id, owner_user_id, job_id, kind, bucket_name, object_key, content_type, file_size_bytes, checksum_sha256)
      VALUES (cast(:id as uuid), cast(:userId as uuid), cast(:jobId as uuid), cast(:kind as media_kind),
              :bucket, :objectKey, :contentType, cast(:fileSizeBytes as bigint), :checksumSha256)
      """, nativeQuery = true)
  void insertAsset(@Param("id") String id, @Param("userId") String userId, @Param("jobId") String jobId,
      @Param("kind") String kind, @Param("bucket") String bucket, @Param("objectKey") String objectKey,
      @Param("contentType") String contentType, @Param("fileSizeBytes") Long fileSizeBytes,
      @Param("checksumSha256") String checksumSha256);

  @Modifying
  @Query(value = """
      INSERT INTO moderation_jobs (media_asset_id, stage, status, details)
      VALUES (cast(:id as uuid), 'technical_validation'::moderation_stage, 'pending'::moderation_status, cast(:details as jsonb))
      """, nativeQuery = true)
  void enqueueTechnicalValidation(@Param("id") String mediaId, @Param("details") String details);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", checksum_sha256 AS "checksumSha256",
             state::text
      FROM media_assets WHERE id = cast(:mediaId as uuid) AND owner_user_id = cast(:userId as uuid)
      """, nativeQuery = true)
  Map<String, Object> findOwnedAsset(@Param("userId") String userId, @Param("mediaId") String mediaId);

  @Query(value = """
      WITH changed AS (
        UPDATE media_assets SET state = 'scanning'::media_state, updated_at = now()
        WHERE id = cast(:mediaId as uuid) AND owner_user_id = cast(:userId as uuid)
        RETURNING id, owner_user_id, job_id, kind, bucket_name, object_key, content_type, file_size_bytes,
                  checksum_sha256, state, created_at, updated_at
      )
      SELECT id, owner_user_id AS "ownerUserId", job_id AS "jobId", kind::text, bucket_name AS "bucketName",
             object_key AS "objectKey", content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM changed
      """, nativeQuery = true)
  Map<String, Object> completeUpload(@Param("userId") String userId, @Param("mediaId") String mediaId);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findInternalUserIdByUsername(@Param("identifier") String identifier);

  @Query(value = """
      SELECT mj.id AS "moderationJobId", ma.id AS "mediaId", mj.stage::text, mj.status::text, mj.reason_code AS "reasonCode",
             mj.created_at AS "moderationCreatedAt", ma.state::text AS "mediaState", ma.owner_user_id AS "ownerUserId",
             ma.kind::text, ma.content_type AS "contentType", ma.file_size_bytes AS "fileSizeBytes"
      FROM moderation_jobs mj JOIN media_assets ma ON ma.id = mj.media_asset_id
      WHERE mj.stage = 'human_review'::moderation_stage
        AND (cast(:stage as text) IS NULL OR mj.stage::text = cast(:stage as text))
        AND (cast(:status as text) IS NULL OR mj.status::text = cast(:status as text))
      ORDER BY mj.created_at ASC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listModerationQueue(@Param("stage") String stage, @Param("status") String status, @Param("limit") int limit);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", kind::text, bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", checksum_sha256 AS "checksumSha256",
             state::text, moderation_reason_codes AS "moderationReasonCodes", ai_scores AS "aiScores",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE id = cast(:mediaId as uuid)
      """, nativeQuery = true)
  Map<String, Object> findModerationMedia(@Param("mediaId") String mediaId);

  @Query(value = """
      SELECT id, media_asset_id AS "mediaAssetId", stage::text, status::text, assigned_moderator_user_id AS "assignedModeratorUserId",
             reason_code AS "reasonCode", details, created_at AS "createdAt", completed_at AS "completedAt"
      FROM moderation_jobs WHERE media_asset_id = cast(:mediaId as uuid) ORDER BY created_at
      """, nativeQuery = true)
  List<Map<String, Object>> listModerationJobs(@Param("mediaId") String mediaId);

  @Query(value = """
      SELECT id, media_asset_id AS "mediaId", stage::text FROM moderation_jobs
      WHERE status = 'pending'::moderation_status
        AND stage IN ('technical_validation'::moderation_stage, 'ai_review'::moderation_stage)
      ORDER BY created_at ASC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listPendingAutomatedJobs(@Param("limit") int limit);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = 'running'::moderation_status
      WHERE id = cast(:id as uuid) AND status = 'pending'::moderation_status
      """, nativeQuery = true)
  int claimModerationJob(@Param("id") String id);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = 'error'::moderation_status, reason_code = 'processing_error',
        completed_at = now() WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  void markModerationJobError(@Param("id") String id);

  @Query(value = """
      SELECT id::text FROM moderation_jobs WHERE media_asset_id = cast(:mediaId as uuid)
        AND stage = 'human_review'::moderation_stage AND status = 'pending'::moderation_status
      ORDER BY created_at LIMIT 1
      """, nativeQuery = true)
  String findPendingHumanReviewJobId(@Param("mediaId") String mediaId);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = cast(:status as moderation_status),
        assigned_moderator_user_id = cast(:moderatorUserId as uuid), reason_code = :reasonCode,
        details = coalesce(details, '{}'::jsonb) || cast(:details as jsonb), completed_at = now()
      WHERE id = cast(:jobId as uuid)
      """, nativeQuery = true)
  void completeHumanReviewJob(@Param("jobId") String jobId, @Param("status") String status,
      @Param("moderatorUserId") String moderatorUserId, @Param("reasonCode") String reasonCode, @Param("details") String details);

  @Query(value = """
      WITH changed AS (
        UPDATE media_assets SET state = cast(:state as media_state),
          moderation_reason_codes = CASE WHEN cast(:reasonCode as text) IS NULL THEN moderation_reason_codes
            WHEN moderation_reason_codes @> ARRAY[cast(:reasonCode as text)] THEN moderation_reason_codes
            ELSE array_append(moderation_reason_codes, cast(:reasonCode as text)) END, updated_at = now()
        WHERE id = cast(:mediaId as uuid)
        RETURNING id, owner_user_id, job_id, kind, bucket_name, object_key, content_type, file_size_bytes,
                  checksum_sha256, state, created_at, updated_at
      )
      SELECT id, owner_user_id AS "ownerUserId", job_id AS "jobId", kind::text, bucket_name AS "bucketName",
             object_key AS "objectKey", content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM changed
      """, nativeQuery = true)
  Map<String, Object> updateHumanReviewState(@Param("mediaId") String mediaId, @Param("state") String state,
      @Param("reasonCode") String reasonCode);

  @Query(value = """
      SELECT owner_user_id AS "ownerUserId", kind::text, content_type AS "contentType", file_size_bytes AS "fileSizeBytes"
      FROM media_assets WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  Map<String, Object> findTechnicalMedia(@Param("id") String mediaId);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = 'rejected'::moderation_status, reason_code = :reasonCode,
        completed_at = now() WHERE id = cast(:jobId as uuid)
      """, nativeQuery = true)
  void rejectTechnicalJob(@Param("jobId") String jobId, @Param("reasonCode") String reasonCode);

  @Modifying
  @Query(value = """
      UPDATE media_assets SET state = 'rejected'::media_state,
        moderation_reason_codes = CASE WHEN moderation_reason_codes @> ARRAY[cast(:reasonCode as text)]
          THEN moderation_reason_codes ELSE array_append(moderation_reason_codes, cast(:reasonCode as text)) END,
        updated_at = now() WHERE id = cast(:mediaId as uuid)
      """, nativeQuery = true)
  void rejectTechnicalAsset(@Param("mediaId") String mediaId, @Param("reasonCode") String reasonCode);

  @Modifying
  @Query(value = "UPDATE moderation_jobs SET status = 'approved'::moderation_status, completed_at = now() WHERE id = cast(:jobId as uuid)", nativeQuery = true)
  void approveModerationJob(@Param("jobId") String jobId);

  @Modifying
  @Query(value = """
      INSERT INTO moderation_jobs (media_asset_id, stage, status, details)
      VALUES (cast(:mediaId as uuid), cast(:stage as moderation_stage), 'pending'::moderation_status, cast(:details as jsonb))
      """, nativeQuery = true)
  void enqueueModerationStage(@Param("mediaId") String mediaId, @Param("stage") String stage, @Param("details") String details);

  @Query(value = """
      SELECT owner_user_id AS "ownerUserId", object_key AS "objectKey", content_type AS "contentType"
      FROM media_assets WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  Map<String, Object> findAiMedia(@Param("id") String mediaId);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = 'approved'::moderation_status,
        details = coalesce(details, '{}'::jsonb) || cast(:details as jsonb), completed_at = now()
      WHERE id = cast(:jobId as uuid)
      """, nativeQuery = true)
  void completeAiModerationJob(@Param("jobId") String jobId, @Param("details") String details);

  @Modifying
  @Query(value = """
      UPDATE media_assets SET state = 'human_review_pending'::media_state, ai_scores = cast(:scores as jsonb),
        moderation_reason_codes = CASE WHEN cast(:reasonCode as text) IS NULL THEN moderation_reason_codes
          WHEN moderation_reason_codes @> ARRAY[cast(:reasonCode as text)] THEN moderation_reason_codes
          ELSE array_append(moderation_reason_codes, cast(:reasonCode as text)) END, updated_at = now()
      WHERE id = cast(:mediaId as uuid)
      """, nativeQuery = true)
  void updateAiReviewState(@Param("mediaId") String mediaId, @Param("scores") String scores, @Param("reasonCode") String reasonCode);
}
