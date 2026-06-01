package com.illamhelp.api.connections;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConnectionRepository extends JpaRepository<ConnectionEntity, UUID> {
  @Query(value = """
      SELECT c.id::text AS id, c.user_a_id::text AS "userAId", c.user_b_id::text AS "userBId", c.requested_by_user_id::text AS "requestedByUserId",
             c.status::text, c.requested_at::text AS "requestedAt", c.decided_at::text AS "decidedAt",
             coalesce(nullif(trim(a.username), ''), 'member_' || substring(md5(a.id::text) FROM 1 FOR 10)) AS "userAPublicId",
             coalesce(nullif(trim(b.username), ''), 'member_' || substring(md5(b.id::text) FROM 1 FOR 10)) AS "userBPublicId",
             coalesce(nullif(trim(requester.username), ''), 'member_' || substring(md5(requester.id::text) FROM 1 FOR 10)) AS "requestedByPublicId"
      FROM connections c JOIN users a ON a.id = c.user_a_id JOIN users b ON b.id = c.user_b_id
      JOIN users requester ON requester.id = c.requested_by_user_id
      WHERE (c.user_a_id = cast(:userId as uuid) OR c.user_b_id = cast(:userId as uuid))
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (c.requested_at, c.id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY c.requested_at DESC, c.id DESC
      LIMIT :limit
      """, nativeQuery = true)
  List<ConnectionRow> listForUser(@Param("userId") String userId,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      SELECT coalesce(nullif(trim(u.username), ''), 'member_' || substring(md5(u.id::text) FROM 1 FOR 10)) AS "userId",
             d.display_name AS "displayName", d.location_label AS "locationLabel",
             d.service_categories AS "serviceCategories", d.recent_job_categories AS "recentJobCategories",
             d.recent_locations AS "recentLocations"
      FROM connection_search_documents d JOIN users u ON u.id = d.user_id
      WHERE d.user_id <> cast(:userId as uuid)
        AND (:query = '' OR d.searchable_text LIKE :needle
          OR d.search_vector @@ plainto_tsquery('simple', :query))
      ORDER BY CASE WHEN lower(u.username) = :query THEN 0 WHEN d.searchable_text LIKE :needle THEN 1 ELSE 2 END,
               CASE WHEN :query = '' THEN 0 ELSE ts_rank(d.search_vector, plainto_tsquery('simple', :query)) END DESC,
               d.job_count DESC, d.updated_at DESC
      LIMIT :limit
      """, nativeQuery = true)
  List<SearchCandidateRow> searchCandidates(@Param("userId") String userId, @Param("query") String query,
      @Param("needle") String needle, @Param("limit") int limit);

  @Query(value = """
      WITH changed AS (
        INSERT INTO connections (user_a_id, user_b_id, requested_by_user_id)
        VALUES (least(cast(:requesterUserId as uuid), cast(:targetUserId as uuid)),
                greatest(cast(:requesterUserId as uuid), cast(:targetUserId as uuid)), cast(:requesterUserId as uuid))
        ON CONFLICT (user_a_id, user_b_id)
        DO UPDATE SET status = 'pending', requested_by_user_id = EXCLUDED.requested_by_user_id,
          requested_at = now(), decided_at = null
        WHERE connections.status = 'declined'::connection_status
        RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      )
      SELECT id::text AS id, user_a_id::text AS "userAId", user_b_id::text AS "userBId", requested_by_user_id::text AS "requestedByUserId",
             status::text, requested_at::text AS "requestedAt", decided_at::text AS "decidedAt" FROM changed
      """, nativeQuery = true)
  ConnectionRow requestConnection(@Param("requesterUserId") String requesterUserId, @Param("targetUserId") String targetUserId);

  @Query(value = """
      SELECT id::text AS id, user_a_id::text AS "userAId", user_b_id::text AS "userBId", requested_by_user_id::text AS "requestedByUserId",
             status::text, requested_at::text AS "requestedAt", decided_at::text AS "decidedAt"
      FROM connections
      WHERE user_a_id = least(cast(:requesterUserId as uuid), cast(:targetUserId as uuid))
        AND user_b_id = greatest(cast(:requesterUserId as uuid), cast(:targetUserId as uuid))
      """, nativeQuery = true)
  ConnectionRow findBetween(@Param("requesterUserId") String requesterUserId, @Param("targetUserId") String targetUserId);

  @Query(value = """
      SELECT id::text AS id, user_a_id::text AS "userAId", user_b_id::text AS "userBId", requested_by_user_id::text AS "requestedByUserId",
             status::text, requested_at::text AS "requestedAt", decided_at::text AS "decidedAt"
      FROM connections WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  ConnectionRow findConnection(@Param("id") String id);

  @Query(value = """
      WITH changed AS (
        UPDATE connections SET status = cast(:status as connection_status), decided_at = now()
        WHERE id = cast(:id as uuid)
          AND (user_a_id = cast(:actorUserId as uuid) OR user_b_id = cast(:actorUserId as uuid))
          AND (cast(:status as text) = 'blocked' OR status = 'pending'::connection_status)
          AND (cast(:status as text) <> 'accepted' OR requested_by_user_id <> cast(:actorUserId as uuid))
        RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      )
      SELECT id::text AS id, user_a_id::text AS "userAId", user_b_id::text AS "userBId", requested_by_user_id::text AS "requestedByUserId",
             status::text, requested_at::text AS "requestedAt", decided_at::text AS "decidedAt" FROM changed
      """, nativeQuery = true)
  ConnectionRow decideConnection(@Param("id") String id, @Param("actorUserId") String actorUserId,
      @Param("status") String status);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findInternalUserIdByUsername(@Param("identifier") String identifier);

  @Query(value = """
      SELECT coalesce(nullif(trim(username), ''), 'member_' || substring(md5(id::text) FROM 1 FOR 10))
      FROM users WHERE id = cast(:userId as uuid)
      """, nativeQuery = true)
  String findPublicUserId(@Param("userId") String userId);

  interface ConnectionRow {
    String getId();
    String getUserAId();
    String getUserBId();
    String getRequestedByUserId();
    String getStatus();
    String getRequestedAt();
    String getDecidedAt();
    String getUserAPublicId();
    String getUserBPublicId();
    String getRequestedByPublicId();
  }

  interface SearchCandidateRow {
    String getUserId();
    String getDisplayName();
    String getLocationLabel();
    String getServiceCategories();
    String getRecentJobCategories();
    String getRecentLocations();
  }
}
