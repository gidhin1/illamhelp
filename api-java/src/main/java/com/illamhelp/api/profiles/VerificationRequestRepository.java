package com.illamhelp.api.profiles;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VerificationRequestRepository extends JpaRepository<VerificationRequestEntity, UUID> {
  @Query(value = """
      SELECT id FROM verification_requests
      WHERE user_id = cast(:userId as uuid) AND status IN ('pending', 'under_review') LIMIT 1
      """, nativeQuery = true)
  List<Map<String, Object>> activeForUser(@Param("userId") String userId);

  @Query(value = """
      WITH created AS (
        INSERT INTO verification_requests (user_id, document_media_ids, document_type, notes)
        VALUES (cast(:userId as uuid), cast(:documentMediaIds as uuid[]), :documentType, :notes)
        RETURNING id, user_id, document_media_ids, document_type, notes, status, reviewer_user_id, reviewer_notes,
                  reviewed_at, created_at, updated_at
      )
      SELECT id, user_id AS "userId", document_media_ids AS "documentMediaIds", document_type AS "documentType",
             notes, status::text, reviewer_user_id AS "reviewerUserId", reviewer_notes AS "reviewerNotes",
             reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM created
      """, nativeQuery = true)
  Map<String, Object> insertRequest(@Param("userId") String userId, @Param("documentMediaIds") String[] documentMediaIds,
      @Param("documentType") String documentType, @Param("notes") Object notes);

  @Query(value = """
      SELECT id, user_id AS "userId", document_media_ids AS "documentMediaIds", document_type AS "documentType",
             notes, status::text, reviewer_user_id AS "reviewerUserId", reviewer_notes AS "reviewerNotes",
             reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM verification_requests WHERE user_id = cast(:userId as uuid) ORDER BY created_at DESC LIMIT 1
      """, nativeQuery = true)
  Map<String, Object> latestForUser(@Param("userId") String userId);

  @Query(value = """
      SELECT id, user_id AS "userId", document_media_ids AS "documentMediaIds", document_type AS "documentType",
             notes, status::text, reviewer_user_id AS "reviewerUserId", reviewer_notes AS "reviewerNotes",
             reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM verification_requests
      WHERE (cast(:status as text) IS NULL OR status::text = cast(:status as text))
      ORDER BY created_at DESC LIMIT :limit OFFSET :offset
      """, nativeQuery = true)
  List<Map<String, Object>> listForAdmin(@Param("status") String status, @Param("limit") int limit, @Param("offset") int offset);

  @Query(value = """
      SELECT count(*) FROM verification_requests
      WHERE (cast(:status as text) IS NULL OR status::text = cast(:status as text))
      """, nativeQuery = true)
  int countForAdmin(@Param("status") String status);

  @Query(value = "SELECT id, user_id AS \"userId\", status::text FROM verification_requests WHERE id = cast(:id as uuid)", nativeQuery = true)
  Map<String, Object> findReviewTarget(@Param("id") String requestId);

  @Query(value = """
      WITH changed AS (
        UPDATE verification_requests SET status = cast(:status as verification_status),
          reviewer_user_id = cast(:actorUserId as uuid), reviewer_notes = :notes, reviewed_at = now(), updated_at = now()
        WHERE id = cast(:id as uuid)
        RETURNING id, user_id, document_media_ids, document_type, notes, status, reviewer_user_id, reviewer_notes,
                  reviewed_at, created_at, updated_at
      )
      SELECT id, user_id AS "userId", document_media_ids AS "documentMediaIds", document_type AS "documentType",
             notes, status::text, reviewer_user_id AS "reviewerUserId", reviewer_notes AS "reviewerNotes",
             reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> reviewUpdate(@Param("id") String requestId, @Param("actorUserId") String actorUserId,
      @Param("status") String status, @Param("notes") Object notes);
}
