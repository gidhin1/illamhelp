package com.illamhelp.api.connections;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConnectionRepository extends JpaRepository<ConnectionEntity, UUID> {
  @Query(value = """
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", requested_by_user_id AS "requestedByUserId",
             status::text, requested_at AS "requestedAt", decided_at AS "decidedAt"
      FROM connections
      WHERE user_a_id = cast(:userId as uuid) OR user_b_id = cast(:userId as uuid)
      ORDER BY requested_at DESC
      LIMIT :limit OFFSET :offset
      """, nativeQuery = true)
  List<Map<String, Object>> listForUser(@Param("userId") String userId, @Param("limit") int limit, @Param("offset") int offset);

  @Query(value = "SELECT count(*) FROM connections WHERE user_a_id = cast(:userId as uuid) OR user_b_id = cast(:userId as uuid)", nativeQuery = true)
  int countForUser(@Param("userId") String userId);

  @Query(value = """
      WITH job_agg AS (
        SELECT seeker_user_id AS user_id,
               array_remove(array_agg(DISTINCT category), NULL) AS job_categories,
               array_remove(array_agg(DISTINCT location_text), NULL) AS job_locations,
               count(*) AS job_count
        FROM jobs GROUP BY seeker_user_id
      ), candidates AS (
        SELECT coalesce(nullif(trim(u.username), ''), 'member_' || substring(md5(u.id::text) FROM 1 FOR 10)) AS "userId",
               coalesce(nullif(trim(concat(p.first_name, ' ', coalesce(p.last_name, ''))), ''), u.username) AS "displayName",
               nullif(trim(concat(coalesce(p.area, ''), ' ', coalesce(p.city, ''))), '') AS "locationLabel",
               coalesce(p.service_categories, '{}'::text[]) AS "serviceCategories",
               coalesce(j.job_categories, '{}'::text[]) AS "recentJobCategories",
               coalesce(j.job_locations, '{}'::text[]) AS "recentLocations",
               coalesce(j.job_count, 0) AS job_count, u.created_at,
               lower(concat_ws(' ', u.username, p.first_name, p.last_name, p.city, p.area,
                 array_to_string(coalesce(p.service_categories, '{}'::text[]), ' '),
                 array_to_string(coalesce(j.job_categories, '{}'::text[]), ' '),
                 array_to_string(coalesce(j.job_locations, '{}'::text[]), ' '))) AS searchable_text
        FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN job_agg j ON j.user_id = u.id
        WHERE u.id <> cast(:userId as uuid)
      )
      SELECT "userId", "displayName", "locationLabel", "serviceCategories", "recentJobCategories", "recentLocations"
      FROM candidates
      WHERE :query = '' OR searchable_text LIKE :needle OR (
        EXISTS (SELECT 1 FROM regexp_split_to_table(:query, '[\\s,;|/]+') AS token WHERE length(token) >= 2)
        AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(:query, '[\\s,;|/]+') AS token
          WHERE length(token) >= 2 AND searchable_text NOT LIKE ('%' || token || '%'))
      )
      ORDER BY CASE WHEN "userId" = :query THEN 0 WHEN searchable_text LIKE :needle THEN 1 ELSE 2 END,
               job_count DESC, created_at DESC
      LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> searchCandidates(@Param("userId") String userId, @Param("query") String query,
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
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", requested_by_user_id AS "requestedByUserId",
             status::text, requested_at AS "requestedAt", decided_at AS "decidedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> requestConnection(@Param("requesterUserId") String requesterUserId, @Param("targetUserId") String targetUserId);

  @Query(value = """
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", requested_by_user_id AS "requestedByUserId",
             status::text, requested_at AS "requestedAt", decided_at AS "decidedAt"
      FROM connections
      WHERE user_a_id = least(cast(:requesterUserId as uuid), cast(:targetUserId as uuid))
        AND user_b_id = greatest(cast(:requesterUserId as uuid), cast(:targetUserId as uuid))
      """, nativeQuery = true)
  Map<String, Object> findBetween(@Param("requesterUserId") String requesterUserId, @Param("targetUserId") String targetUserId);

  @Query(value = """
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", requested_by_user_id AS "requestedByUserId",
             status::text, requested_at AS "requestedAt", decided_at AS "decidedAt"
      FROM connections WHERE id = cast(:id as uuid)
      """, nativeQuery = true)
  Map<String, Object> findConnection(@Param("id") String id);

  @Query(value = """
      WITH changed AS (
        UPDATE connections SET status = cast(:status as connection_status), decided_at = now()
        WHERE id = cast(:id as uuid)
        RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      )
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", requested_by_user_id AS "requestedByUserId",
             status::text, requested_at AS "requestedAt", decided_at AS "decidedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> decideConnection(@Param("id") String id, @Param("status") String status);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findInternalUserIdByUsername(@Param("identifier") String identifier);

  @Query(value = """
      SELECT coalesce(nullif(trim(username), ''), 'member_' || substring(md5(id::text) FROM 1 FOR 10))
      FROM users WHERE id = cast(:userId as uuid)
      """, nativeQuery = true)
  String findPublicUserId(@Param("userId") String userId);
}
