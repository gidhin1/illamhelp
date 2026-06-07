package com.illamhelp.api.profiles;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VerificationRequestRepository extends JpaRepository<VerificationRequestEntity, UUID> {
  @Query(value = """
      SELECT id::text AS id FROM verification_requests
      WHERE user_id = cast(:userId as uuid) AND status IN ('pending', 'under_review') LIMIT 1
      """, nativeQuery = true)
  List<ActiveRequestRow> activeForUser(@Param("userId") String userId);

  @Query(value = """
      SELECT count(*) FROM unnest(cast(:mediaIds as uuid[])) AS requested(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM media_assets ma
        WHERE ma.id = requested.id
          AND ma.owner_user_id = cast(:userId as uuid)
          AND ma.profile_user_id = cast(:userId as uuid)
          AND ma.purpose = 'verification_document'::media_purpose
          AND ma.state NOT IN ('uploaded'::media_state, 'rejected'::media_state)
      )
      """, nativeQuery = true)
  long countInvalidVerificationDocumentMedia(@Param("userId") String userId, @Param("mediaIds") String[] mediaIds);

  @Query(value = """
      WITH created AS (
        INSERT INTO verification_requests (user_id, document_media_ids, document_type, notes)
        VALUES (cast(:userId as uuid), cast(:documentMediaIds as uuid[]), :documentType, :notes)
        RETURNING id, user_id, document_media_ids, document_type, notes, status, reviewer_user_id, reviewer_notes,
                  reviewed_at, created_at, updated_at
      )
      SELECT id::text AS id, user_id::text AS "userId",
             ARRAY(SELECT media_id::text FROM unnest(document_media_ids) AS media_id) AS "documentMediaIds",
             document_type AS "documentType", notes, status::text, reviewer_user_id::text AS "reviewerUserId",
             reviewer_notes AS "reviewerNotes", reviewed_at::text AS "reviewedAt",
             created_at::text AS "createdAt", updated_at::text AS "updatedAt" FROM created
      """, nativeQuery = true)
  VerificationRecordRow insertRequest(@Param("userId") String userId, @Param("documentMediaIds") String[] documentMediaIds,
      @Param("documentType") String documentType, @Param("notes") Object notes);

  @Query(value = """
      SELECT id::text AS id, user_id::text AS "userId",
             ARRAY(SELECT media_id::text FROM unnest(document_media_ids) AS media_id) AS "documentMediaIds",
             document_type AS "documentType", notes, status::text, reviewer_user_id::text AS "reviewerUserId",
             reviewer_notes AS "reviewerNotes", reviewed_at::text AS "reviewedAt",
             created_at::text AS "createdAt", updated_at::text AS "updatedAt"
      FROM verification_requests WHERE user_id = cast(:userId as uuid) ORDER BY created_at DESC LIMIT 1
      """, nativeQuery = true)
  VerificationRecordRow latestForUser(@Param("userId") String userId);

  @Query(value = """
      SELECT id::text AS id, user_id::text AS "userId",
             ARRAY(SELECT media_id::text FROM unnest(document_media_ids) AS media_id) AS "documentMediaIds",
             document_type AS "documentType", notes, status::text, reviewer_user_id::text AS "reviewerUserId",
             reviewer_notes AS "reviewerNotes", reviewed_at::text AS "reviewedAt",
             created_at::text AS "createdAt", updated_at::text AS "updatedAt"
      FROM verification_requests
      WHERE (cast(:status as text) IS NULL OR status::text = cast(:status as text))
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (created_at, id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY created_at DESC, id DESC LIMIT :limit
      """, nativeQuery = true)
  List<VerificationRecordRow> listForAdmin(@Param("status") String status, @Param("cursorCreatedAt") String cursorCreatedAt,
      @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = "SELECT id::text AS id, user_id::text AS \"userId\", status::text FROM verification_requests WHERE id = cast(:id as uuid)", nativeQuery = true)
  ReviewTargetRow findReviewTarget(@Param("id") String requestId);

  @Query(value = """
      WITH changed AS (
        UPDATE verification_requests SET status = cast(:status as verification_status),
          reviewer_user_id = cast(:actorUserId as uuid), reviewer_notes = :notes, reviewed_at = now(), updated_at = now()
        WHERE id = cast(:id as uuid)
          AND status IN ('pending'::verification_status, 'under_review'::verification_status)
        RETURNING id, user_id, document_media_ids, document_type, notes, status, reviewer_user_id, reviewer_notes,
                  reviewed_at, created_at, updated_at
      )
      SELECT id::text AS id, user_id::text AS "userId",
             ARRAY(SELECT media_id::text FROM unnest(document_media_ids) AS media_id) AS "documentMediaIds",
             document_type AS "documentType", notes, status::text, reviewer_user_id::text AS "reviewerUserId",
             reviewer_notes AS "reviewerNotes", reviewed_at::text AS "reviewedAt",
             created_at::text AS "createdAt", updated_at::text AS "updatedAt" FROM changed
      """, nativeQuery = true)
  VerificationRecordRow reviewUpdate(@Param("id") String requestId, @Param("actorUserId") String actorUserId,
      @Param("status") String status, @Param("notes") Object notes);

  interface ActiveRequestRow {
    String getId();
  }

  interface ReviewTargetRow {
    String getId();

    String getUserId();

    String getStatus();
  }

  interface VerificationRecordRow {
    String getId();

    String getUserId();

    String[] getDocumentMediaIds();

    String getDocumentType();

    String getNotes();

    String getStatus();

    String getReviewerUserId();

    String getReviewerNotes();

    String getReviewedAt();

    String getCreatedAt();

    String getUpdatedAt();
  }
}
