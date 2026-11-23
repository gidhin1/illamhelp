package com.illamhelp.api.media;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> {
  String APPEAL_ELIGIBLE = """
      purpose IN ('profile', 'job') AND state = 'rejected'::media_state
      AND moderation_reason_codes[array_upper(moderation_reason_codes, 1)] = 'technical_photo_format_mismatch'
      AND EXISTS (SELECT 1 FROM moderation_jobs automated WHERE automated.media_asset_id = ma.id
        AND automated.stage = 'ai_review' AND automated.status = 'rejected'
        AND automated.reason_code = 'technical_photo_format_mismatch')
      AND NOT EXISTS (SELECT 1 FROM moderation_jobs reviewed WHERE reviewed.media_asset_id = ma.id
        AND reviewed.stage = 'human_review')
      """;

  String OWNED_MEDIA = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName",
             object_key AS "objectKey", content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt",
             CASE WHEN state = 'rejected'::media_state THEN
               moderation_reason_codes[array_upper(moderation_reason_codes, 1)] END AS "rejectionReasonCode",
             coalesce((
      """ + APPEAL_ELIGIBLE + """
      ), false) AS "appealEligible"
      FROM media_assets ma WHERE owner_user_id = cast(:userId as uuid)
      """;

  @Query(value = OWNED_MEDIA + """
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listMine(@Param("userId") String userId, @Param("cursorCreatedAt") String cursorCreatedAt,
      @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = OWNED_MEDIA + " AND id = cast(:mediaId as uuid)", nativeQuery = true)
  Map<String, Object> findOwnedMedia(@Param("userId") String userId, @Param("mediaId") String mediaId);

  @Modifying
  @Query(value = """
      WITH appealed AS (
        UPDATE media_assets ma SET state = 'appeal_pending'::media_state, updated_at = now()
        WHERE ma.id = cast(:mediaId as uuid) AND owner_user_id = cast(:userId as uuid) AND (
      """ + APPEAL_ELIGIBLE + """
        )
        RETURNING id
      )
      INSERT INTO moderation_jobs (media_asset_id, stage, status, details)
      SELECT id, 'human_review', 'pending', '{"source":"owner_appeal"}'::jsonb FROM appealed
      """, nativeQuery = true)
  int enqueueOwnerAppeal(@Param("userId") String userId, @Param("mediaId") String mediaId);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", state::text,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE purpose = 'profile'::media_purpose
        AND profile_user_id = cast(:profileUserId as uuid) AND state = 'approved'
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listApprovedForProfile(@Param("profileUserId") String profileUserId,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", state::text,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE purpose = 'job'::media_purpose
        AND job_id = cast(:jobId as uuid) AND state = 'approved'
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listApprovedForJob(@Param("jobId") String jobId,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM media_assets WHERE purpose = 'verification_document'::media_purpose
        AND owner_user_id = cast(:userId as uuid)
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listVerificationDocuments(@Param("userId") String userId,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Modifying
  @Query(value = """
      INSERT INTO media_assets (
        id, owner_user_id, profile_user_id, job_id, purpose, kind, bucket_name, object_key,
        content_type, file_size_bytes, checksum_sha256
      )
      VALUES (
        cast(:id as uuid), cast(:userId as uuid), cast(:profileUserId as uuid), cast(:jobId as uuid),
        cast(:purpose as media_purpose), cast(:kind as media_kind), :bucket, :objectKey,
        :contentType, cast(:fileSizeBytes as bigint), :checksumSha256
      )
      """, nativeQuery = true)
  void insertAsset(@Param("id") String id, @Param("userId") String userId, @Param("profileUserId") String profileUserId,
      @Param("jobId") String jobId, @Param("purpose") String purpose, @Param("kind") String kind,
      @Param("bucket") String bucket, @Param("objectKey") String objectKey,
      @Param("contentType") String contentType, @Param("fileSizeBytes") Long fileSizeBytes,
      @Param("checksumSha256") String checksumSha256);

  @Modifying
  @Query(value = """
      INSERT INTO moderation_jobs (media_asset_id, stage, status, details)
      VALUES (cast(:id as uuid), 'technical_validation'::moderation_stage, 'pending'::moderation_status, cast(:details as jsonb))
      """, nativeQuery = true)
  void enqueueTechnicalValidation(@Param("id") String mediaId, @Param("details") String details);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, bucket_name AS "bucketName", object_key AS "objectKey",
             content_type AS "contentType", file_size_bytes AS "fileSizeBytes", checksum_sha256 AS "checksumSha256",
             state::text
      FROM media_assets WHERE id = cast(:mediaId as uuid) AND owner_user_id = cast(:userId as uuid)
      """, nativeQuery = true)
  Map<String, Object> findOwnedAsset(@Param("userId") String userId, @Param("mediaId") String mediaId);

  @Query(value = """
      WITH changed AS (
        UPDATE media_assets SET state = 'scanning'::media_state, updated_at = now()
        WHERE id = cast(:mediaId as uuid) AND owner_user_id = cast(:userId as uuid)
          AND state = 'uploaded'::media_state
        RETURNING id, owner_user_id, profile_user_id, job_id, purpose, kind, bucket_name, object_key, content_type, file_size_bytes,
                  checksum_sha256, state, created_at, updated_at
      )
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName",
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
             ma.kind::text, ma.purpose::text, ma.content_type AS "contentType", ma.file_size_bytes AS "fileSizeBytes"
      FROM moderation_jobs mj
      JOIN media_assets ma ON mj.media_asset_id = ma.id
      JOIN users u ON u.id = ma.owner_user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE mj.stage = 'human_review'::moderation_stage
        AND (cast(:stage as text) IS NULL OR mj.stage::text = cast(:stage as text))
        AND (cast(:status as text) IS NULL OR mj.status::text = cast(:status as text))
        AND (:query = '' OR position(cast(:query as text) IN lower(concat_ws(' ',
          ma.id, u.id, u.username, p.first_name, p.last_name, p.city, p.area,
          array_to_string(p.service_categories, ' '), ma.kind,
          CASE WHEN ma.kind::text = 'image' THEN 'photo' ELSE 'video' END,
          replace(ma.purpose::text, '_', ' '), replace(ma.state::text, '_', ' '),
          ma.purpose, ma.state, mj.status, mj.reason_code
        ))) > 0)
      ORDER BY
        CASE WHEN :newestFirst THEN mj.created_at END DESC,
        CASE WHEN NOT :newestFirst THEN mj.created_at END ASC,
        mj.id ASC
      LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listModerationQueue(@Param("stage") String stage, @Param("status") String status,
      @Param("limit") int limit, @Param("query") String query, @Param("newestFirst") boolean newestFirst);

  @Query(value = """
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName", object_key AS "objectKey",
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
      WITH candidate AS (
        SELECT id FROM moderation_jobs
        WHERE EXISTS (SELECT 1 FROM media_assets asset
          WHERE asset.id = media_asset_id AND asset.state = 'scanning'::media_state)
          AND ((status = 'pending'::moderation_status AND screening_available_at <= now()
            AND stage IN ('technical_validation'::moderation_stage, 'ai_review'::moderation_stage))
          OR (status = 'running'::moderation_status AND stage = 'ai_review'::moderation_stage
            AND screening_lease_until <= now()))
        ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE moderation_jobs mj SET status = 'running'::moderation_status,
          screening_lease_token = gen_random_uuid(),
          screening_lease_until = now() + interval '3 minutes',
          screening_attempts = screening_attempts + 1
        FROM candidate c WHERE mj.id = c.id
        RETURNING mj.id, mj.media_asset_id, mj.stage, mj.screening_lease_token, mj.screening_attempts
      )
      SELECT id::text, media_asset_id::text AS "mediaId", stage::text, screening_lease_token::text AS "leaseToken",
             screening_attempts AS "attempts" FROM claimed
      """, nativeQuery = true)
  Map<String, Object> claimNextAutomatedJob();

  @Query(value = """
      SELECT id::text FROM moderation_jobs
      WHERE id = cast(:id as uuid) AND status = 'running'::moderation_status
        AND screening_lease_token = cast(:lease as uuid) AND screening_lease_until > now()
      FOR UPDATE
      """, nativeQuery = true)
  String lockScreeningLease(@Param("id") String id, @Param("lease") String lease);

  @Modifying
  @Query(value = """
      UPDATE moderation_jobs SET status = 'pending'::moderation_status,
        screening_available_at = now() + make_interval(mins => :delay),
        screening_lease_until = NULL, screening_lease_token = NULL
      WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  void retryScreening(@Param("id") String id, @Param("delay") int delayMinutes);

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
      WHERE id = cast(:jobId as uuid) AND status = 'pending'::moderation_status
      """, nativeQuery = true)
  int completeHumanReviewJob(@Param("jobId") String jobId, @Param("status") String status,
      @Param("moderatorUserId") String moderatorUserId, @Param("reasonCode") String reasonCode, @Param("details") String details);

  @Query(value = """
      WITH changed AS (
        UPDATE media_assets SET state = cast(:state as media_state),
          moderation_reason_codes = CASE WHEN cast(:reasonCode as text) IS NULL THEN moderation_reason_codes
            WHEN moderation_reason_codes @> ARRAY[cast(:reasonCode as text)] THEN moderation_reason_codes
            ELSE array_append(moderation_reason_codes, cast(:reasonCode as text)) END, updated_at = now()
        WHERE id = cast(:mediaId as uuid) AND state IN ('human_review_pending'::media_state, 'appeal_pending'::media_state)
        RETURNING id, owner_user_id, profile_user_id, job_id, purpose, kind, bucket_name, object_key, content_type, file_size_bytes,
                  checksum_sha256, state, created_at, updated_at
      )
      SELECT id, owner_user_id AS "ownerUserId", profile_user_id AS "profileUserId", job_id AS "jobId",
             purpose::text, kind::text, bucket_name AS "bucketName",
             object_key AS "objectKey", content_type AS "contentType", file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256", state::text, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM changed
      """, nativeQuery = true)
  Map<String, Object> updateHumanReviewState(@Param("mediaId") String mediaId, @Param("state") String state,
      @Param("reasonCode") String reasonCode);

  @Query(value = """
      SELECT EXISTS (
        SELECT 1 FROM connections c
        WHERE c.status = 'accepted'::connection_status
          AND ((c.user_a_id = cast(:viewerUserId as uuid) AND c.user_b_id = cast(:profileUserId as uuid))
            OR (c.user_b_id = cast(:viewerUserId as uuid) AND c.user_a_id = cast(:profileUserId as uuid)))
      )
      """, nativeQuery = true)
  boolean isAcceptedConnection(@Param("viewerUserId") String viewerUserId, @Param("profileUserId") String profileUserId);

  @Query(value = """
      SELECT EXISTS (
        SELECT 1 FROM jobs j WHERE j.id = cast(:jobId as uuid) AND (
          j.seeker_user_id = cast(:viewerUserId as uuid)
          OR j.assigned_provider_user_id = cast(:viewerUserId as uuid)
          OR (j.status = 'posted'::job_status AND (
            j.visibility = 'public'::job_visibility
            OR (j.visibility = 'connections_only'::job_visibility AND EXISTS (
              SELECT 1 FROM connections c WHERE c.status = 'accepted'::connection_status
                AND ((c.user_a_id = cast(:viewerUserId as uuid) AND c.user_b_id = j.seeker_user_id)
                  OR (c.user_b_id = cast(:viewerUserId as uuid) AND c.user_a_id = j.seeker_user_id)))
            )
          ))
        )
      )
      """, nativeQuery = true)
  boolean canViewJob(@Param("viewerUserId") String viewerUserId, @Param("jobId") String jobId);

  @Query(value = """
      SELECT EXISTS (
        SELECT 1 FROM jobs j WHERE j.id = cast(:jobId as uuid)
          AND (
            j.seeker_user_id = cast(:userId as uuid)
            OR j.assigned_provider_user_id = cast(:userId as uuid)
            OR EXISTS (
              SELECT 1 FROM job_applications ja
              WHERE ja.job_id = j.id AND ja.provider_user_id = cast(:userId as uuid)
                AND ja.status IN ('applied'::application_status, 'shortlisted'::application_status, 'accepted'::application_status)
            )
          )
      )
      """, nativeQuery = true)
  boolean canAttachJobMedia(@Param("userId") String userId, @Param("jobId") String jobId);

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
      SELECT owner_user_id AS "ownerUserId", object_key AS "objectKey", bucket_name AS "bucketName",
             content_type AS "contentType", purpose::text, kind::text, file_size_bytes AS "fileSizeBytes",
             checksum_sha256 AS "checksumSha256"
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
