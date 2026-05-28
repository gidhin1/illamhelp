package com.illamhelp.api.jobs;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobRepository extends JpaRepository<JobEntity, UUID> {
  @Query(value = """
      SELECT j.id, j.seeker_user_id AS "seekerUserId", j.category, j.title, j.description, j.location_text AS "locationText",
             j.location_latitude AS "locationLatitude", j.location_longitude AS "locationLongitude",
             j.visibility::text, j.status::text, j.assigned_provider_user_id AS "assignedProviderUserId",
             j.accepted_application_id AS "acceptedApplicationId", j.created_at AS "createdAt", j.updated_at AS "updatedAt",
             coalesce(nullif(trim(seeker.username), ''), 'member_' || substring(md5(seeker.id::text) FROM 1 FOR 10)) AS "seekerPublicUserId",
             CASE WHEN provider.id IS NULL THEN NULL ELSE
               coalesce(nullif(trim(provider.username), ''), 'member_' || substring(md5(provider.id::text) FROM 1 FOR 10)) END AS "assignedProviderPublicUserId"
      FROM jobs j JOIN users seeker ON seeker.id = j.seeker_user_id
      LEFT JOIN users provider ON provider.id = j.assigned_provider_user_id
      WHERE (j.seeker_user_id = cast(:userId as uuid) OR j.assigned_provider_user_id = cast(:userId as uuid)
        OR (j.status = 'posted' AND (j.visibility = 'public' OR (j.visibility = 'connections_only' AND EXISTS (
          SELECT 1 FROM connections c WHERE c.status = 'accepted' AND
            ((c.user_a_id = cast(:userId as uuid) AND c.user_b_id = j.seeker_user_id)
             OR (c.user_b_id = cast(:userId as uuid) AND c.user_a_id = j.seeker_user_id)))))))
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (j.created_at, j.id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY j.created_at DESC, j.id DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listVisible(@Param("userId") String userId,
      @Param("cursorCreatedAt") String cursorCreatedAt, @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      WITH ranked_ids AS (
        SELECT cast(candidate.id as uuid) AS id, candidate.search_rank
        FROM unnest(cast(:preferredIds as text[])) WITH ORDINALITY AS candidate(id, search_rank)
      )
      SELECT j.id, j.seeker_user_id AS "seekerUserId", j.category, j.title, j.description, j.location_text AS "locationText",
             j.location_latitude AS "locationLatitude", j.location_longitude AS "locationLongitude",
             j.visibility::text, j.status::text, j.assigned_provider_user_id AS "assignedProviderUserId",
             j.accepted_application_id AS "acceptedApplicationId", j.created_at AS "createdAt", j.updated_at AS "updatedAt",
             coalesce(nullif(trim(seeker.username), ''), 'member_' || substring(md5(seeker.id::text) FROM 1 FOR 10)) AS "seekerPublicUserId",
             CASE WHEN provider.id IS NULL THEN NULL ELSE
               coalesce(nullif(trim(provider.username), ''), 'member_' || substring(md5(provider.id::text) FROM 1 FOR 10)) END AS "assignedProviderPublicUserId"
      FROM jobs j LEFT JOIN profiles p ON p.user_id = j.seeker_user_id
      JOIN users seeker ON seeker.id = j.seeker_user_id
      LEFT JOIN users provider ON provider.id = j.assigned_provider_user_id
      LEFT JOIN ranked_ids ranked ON ranked.id = j.id
      WHERE (cast(:preferredIds as text[]) IS NULL OR ranked.id IS NOT NULL)
        AND (j.seeker_user_id = cast(:userId as uuid) OR j.assigned_provider_user_id = cast(:userId as uuid)
        OR (j.status = 'posted'::job_status AND (j.visibility = 'public'::job_visibility
          OR (j.visibility = 'connections_only'::job_visibility AND EXISTS (
            SELECT 1 FROM connections c WHERE c.status = 'accepted'::connection_status AND
              ((c.user_a_id = cast(:userId as uuid) AND c.user_b_id = j.seeker_user_id)
               OR (c.user_b_id = cast(:userId as uuid) AND c.user_a_id = j.seeker_user_id)))))))
        AND (cast(:q as text) IS NULL OR lower(j.title) LIKE :q OR lower(j.description) LIKE :q
          OR lower(j.category) LIKE :q OR lower(j.location_text) LIKE :q)
        AND (cast(:category as text) IS NULL OR lower(j.category) LIKE :category)
        AND (cast(:locationText as text) IS NULL OR lower(j.location_text) LIKE :locationText)
        AND (cast(:minSeekerRating as numeric) IS NULL OR coalesce(p.rating_average, 0) >= cast(:minSeekerRating as numeric))
        AND (cast(:statuses as text) IS NULL OR j.status::text = ANY(string_to_array(:statuses, ',')))
        AND (cast(:visibility as text) IS NULL OR j.visibility::text = :visibility)
        AND (cast(:latitude as double precision) IS NULL OR (j.location_latitude IS NOT NULL AND j.location_longitude IS NOT NULL
          AND (6371 * acos(least(1.0, greatest(-1.0,
            cos(radians(cast(:latitude as double precision))) * cos(radians(j.location_latitude))
              * cos(radians(j.location_longitude) - radians(cast(:longitude as double precision)))
              + sin(radians(cast(:latitude as double precision))) * sin(radians(j.location_latitude))
          )))) <= cast(:radiusKm as double precision)))
      ORDER BY ranked.search_rank NULLS LAST, j.created_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> searchVisible(@Param("preferredIds") String[] preferredIds, @Param("userId") String userId, @Param("q") String query,
      @Param("category") String category, @Param("locationText") String locationText,
      @Param("minSeekerRating") Double minSeekerRating, @Param("statuses") String statuses,
      @Param("visibility") String visibility, @Param("latitude") Double latitude,
      @Param("longitude") Double longitude, @Param("radiusKm") Double radiusKm, @Param("limit") int limit);

  @Query(value = """
      WITH created AS (
        INSERT INTO jobs (seeker_user_id, category, title, description, location_text, visibility, location_latitude, location_longitude)
        VALUES (cast(:userId as uuid), :category, :title, :description, :locationText, cast(:visibility as job_visibility),
                cast(:locationLatitude as double precision), cast(:locationLongitude as double precision))
        RETURNING id, seeker_user_id, category, title, description, location_text, location_latitude, location_longitude, visibility, status,
                  assigned_provider_user_id, accepted_application_id, created_at, updated_at
      )
      SELECT created.id, created.seeker_user_id AS "seekerUserId", created.category, created.title, created.description,
             created.location_text AS "locationText", created.location_latitude AS "locationLatitude",
             created.location_longitude AS "locationLongitude", coalesce(p.rating_average, 0) AS "seekerRating",
             created.visibility::text, created.status::text, created.assigned_provider_user_id AS "assignedProviderUserId",
             created.accepted_application_id AS "acceptedApplicationId", created.created_at AS "createdAt",
             created.updated_at AS "updatedAt"
      FROM created LEFT JOIN profiles p ON p.user_id = created.seeker_user_id
      """, nativeQuery = true)
  Map<String, Object> createJob(@Param("userId") String userId, @Param("category") String category, @Param("title") String title,
      @Param("description") String description, @Param("locationText") String locationText, @Param("visibility") String visibility,
      @Param("locationLatitude") Double locationLatitude, @Param("locationLongitude") Double locationLongitude);

  @Query(value = """
      SELECT j.id, j.seeker_user_id AS "seekerUserId", j.category, j.title, j.description,
             j.location_text AS "locationText", j.location_latitude AS "locationLatitude",
             j.location_longitude AS "locationLongitude", coalesce(p.rating_average, 0) AS "seekerRating",
             j.visibility::text, j.status::text, j.assigned_provider_user_id AS "assignedProviderUserId",
             j.accepted_application_id AS "acceptedApplicationId", j.created_at AS "createdAt", j.updated_at AS "updatedAt"
      FROM jobs j LEFT JOIN profiles p ON p.user_id = j.seeker_user_id WHERE j.id = cast(:jobId as uuid)
      """, nativeQuery = true)
  Map<String, Object> findIndexableJob(@Param("jobId") String jobId);

  @Query(value = """
      SELECT j.seeker_user_id, j.status::text, j.visibility::text
      FROM jobs j WHERE j.id = cast(:jobId as uuid) AND (
        j.seeker_user_id = cast(:userId as uuid)
        OR j.visibility = 'public'::job_visibility
        OR (j.visibility = 'connections_only'::job_visibility AND EXISTS (
          SELECT 1 FROM connections c WHERE c.status = 'accepted'::connection_status AND
            ((c.user_a_id = cast(:userId as uuid) AND c.user_b_id = j.seeker_user_id)
             OR (c.user_b_id = cast(:userId as uuid) AND c.user_a_id = j.seeker_user_id))))
      )
      """, nativeQuery = true)
  Map<String, Object> applicationEligibility(@Param("userId") String userId, @Param("jobId") String jobId);

  @Query(value = """
      WITH created AS (
        INSERT INTO job_applications (job_id, provider_user_id, message)
        SELECT j.id, cast(:userId as uuid), cast(:message as text)
        FROM jobs j WHERE j.id = cast(:jobId as uuid)
          AND j.status = 'posted'::job_status
          AND j.seeker_user_id <> cast(:userId as uuid)
          AND (j.visibility = 'public'::job_visibility
            OR (j.visibility = 'connections_only'::job_visibility AND EXISTS (
              SELECT 1 FROM connections c WHERE c.status = 'accepted'::connection_status AND
                ((c.user_a_id = cast(:userId as uuid) AND c.user_b_id = j.seeker_user_id)
                 OR (c.user_b_id = cast(:userId as uuid) AND c.user_a_id = j.seeker_user_id)))))
        ON CONFLICT (job_id, provider_user_id) DO UPDATE
          SET message = EXCLUDED.message, status = 'applied', updated_at = now()
        RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
      )
      SELECT id, job_id AS "jobId", provider_user_id AS "providerUserId", status::text, message,
             created_at AS "createdAt", updated_at AS "updatedAt" FROM created
      """, nativeQuery = true)
  Map<String, Object> applyAuthorized(@Param("userId") String userId, @Param("jobId") String jobId, @Param("message") Object message);

  @Query(value = """
      SELECT ja.id, ja.job_id AS "jobId", ja.provider_user_id AS "providerUserId", ja.status::text, ja.message,
             ja.created_at AS "createdAt", ja.updated_at AS "updatedAt",
             coalesce(nullif(trim(provider.username), ''), 'member_' || substring(md5(provider.id::text) FROM 1 FOR 10)) AS "providerPublicUserId"
      FROM job_applications ja JOIN users provider ON provider.id = ja.provider_user_id
      WHERE ja.job_id = cast(:jobId as uuid) AND (
        EXISTS (SELECT 1 FROM jobs j WHERE j.id = ja.job_id AND j.seeker_user_id = cast(:actorUserId as uuid))
        OR ja.provider_user_id = cast(:actorUserId as uuid))
      ORDER BY ja.created_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listApplications(@Param("jobId") String jobId, @Param("actorUserId") String actorUserId,
      @Param("limit") int limit);

  @Query(value = """
      SELECT ja.id, ja.job_id AS "jobId", ja.provider_user_id AS "providerUserId", ja.status::text, ja.message,
             ja.created_at AS "createdAt", ja.updated_at AS "updatedAt",
             coalesce(nullif(trim(provider.username), ''), 'member_' || substring(md5(provider.id::text) FROM 1 FOR 10)) AS "providerPublicUserId"
      FROM job_applications ja JOIN users provider ON provider.id = ja.provider_user_id
      WHERE ja.provider_user_id = cast(:userId as uuid) ORDER BY ja.created_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> listMyApplications(@Param("userId") String userId, @Param("limit") int limit);

  @Query(value = """
      SELECT ja.id, ja.job_id, ja.provider_user_id, ja.status::text, j.seeker_user_id, j.status::text AS job_status
      FROM job_applications ja JOIN jobs j ON j.id = ja.job_id WHERE ja.id = cast(:applicationId as uuid)
      """, nativeQuery = true)
  Map<String, Object> applicationWithJob(@Param("applicationId") String applicationId);

  @Query(value = """
      SELECT id, job_id AS "jobId", provider_user_id AS "providerUserId", status::text, message,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM job_applications WHERE id = cast(:applicationId as uuid)
      """, nativeQuery = true)
  Map<String, Object> applicationById(@Param("applicationId") String applicationId);

  @Query(value = """
      WITH assigned AS (
        UPDATE jobs j SET status = 'accepted'::job_status,
          assigned_provider_user_id = ja.provider_user_id,
          accepted_application_id = ja.id, updated_at = now()
        FROM job_applications ja
        WHERE ja.id = cast(:applicationId as uuid) AND ja.job_id = j.id
          AND j.seeker_user_id = cast(:seekerUserId as uuid)
          AND j.status = 'posted'::job_status
          AND ja.status IN ('applied'::application_status, 'shortlisted'::application_status)
        RETURNING j.accepted_application_id
      ), changed AS (
        UPDATE job_applications ja SET status = 'accepted'::application_status, updated_at = now()
        FROM assigned a WHERE ja.id = a.accepted_application_id
        RETURNING ja.id, ja.job_id, ja.provider_user_id, ja.status, ja.message, ja.created_at, ja.updated_at
      )
      SELECT id, job_id AS "jobId", provider_user_id AS "providerUserId", status::text, message,
             created_at AS "createdAt", updated_at AS "updatedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> acceptAuthorized(@Param("applicationId") String applicationId, @Param("seekerUserId") String seekerUserId);

  @Query(value = """
      SELECT EXISTS (
        SELECT 1 FROM job_applications
        WHERE id = cast(:applicationId as uuid)
          AND status = 'accepted'::application_status
          AND updated_at + make_interval(mins => :windowMinutes) >= now()
      )
      """, nativeQuery = true)
  boolean assignmentWithinRevokeWindow(@Param("applicationId") String applicationId,
      @Param("windowMinutes") int windowMinutes);

  @Query(value = """
      WITH changed AS (
        UPDATE job_applications SET status = cast(:status as application_status), updated_at = now()
        WHERE id = cast(:applicationId as uuid)
          AND status IN ('applied'::application_status, 'shortlisted'::application_status)
        RETURNING id, job_id, provider_user_id, status, message, created_at, updated_at
      )
      SELECT id, job_id AS "jobId", provider_user_id AS "providerUserId", status::text, message,
             created_at AS "createdAt", updated_at AS "updatedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> setApplicationStatus(@Param("applicationId") String applicationId, @Param("status") String status);

  @Modifying
  @Query(value = """
      UPDATE job_applications SET status = 'rejected'::application_status, updated_at = now()
      WHERE job_id = cast(:jobId as uuid) AND id <> cast(:applicationId as uuid)
        AND status IN ('applied'::application_status, 'shortlisted'::application_status)
      """, nativeQuery = true)
  void rejectOtherApplications(@Param("jobId") String jobId, @Param("applicationId") String applicationId);

  @Query(value = "SELECT id, seeker_user_id, status::text, assigned_provider_user_id, accepted_application_id FROM jobs WHERE id = cast(:jobId as uuid)", nativeQuery = true)
  Map<String, Object> jobState(@Param("jobId") String jobId);

  @Query(value = """
      WITH changed AS (
        UPDATE jobs SET status = cast(:status as job_status), updated_at = now()
        WHERE id = cast(:jobId as uuid) AND status = cast(:expectedStatus as job_status)
        RETURNING id, seeker_user_id, category, title, description, location_text, visibility, status,
                  location_latitude, location_longitude,
                  assigned_provider_user_id, accepted_application_id, created_at, updated_at
      )
      SELECT id, seeker_user_id AS "seekerUserId", category, title, description, location_text AS "locationText",
             location_latitude AS "locationLatitude", location_longitude AS "locationLongitude",
             visibility::text, status::text, assigned_provider_user_id AS "assignedProviderUserId",
             accepted_application_id AS "acceptedApplicationId", created_at AS "createdAt", updated_at AS "updatedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> transitionJobStatus(@Param("jobId") String jobId, @Param("expectedStatus") String expectedStatus,
      @Param("status") String status);

  @Modifying
  @Query(value = """
      UPDATE job_applications SET status = cast(:status as application_status), updated_at = now()
      WHERE id = cast(:applicationId as uuid) AND status = 'accepted'::application_status
      """, nativeQuery = true)
  void updateAcceptedApplicationStatus(@Param("applicationId") String applicationId, @Param("status") String status);

  @Query(value = """
      WITH changed AS (
        UPDATE jobs SET status = 'posted'::job_status, assigned_provider_user_id = null,
          accepted_application_id = null, updated_at = now()
        WHERE id = cast(:jobId as uuid) AND status = 'accepted'::job_status
        RETURNING id, seeker_user_id, category, title, description, location_text, visibility, status,
                  location_latitude, location_longitude,
                  assigned_provider_user_id, accepted_application_id, created_at, updated_at
      )
      SELECT id, seeker_user_id AS "seekerUserId", category, title, description, location_text AS "locationText",
             location_latitude AS "locationLatitude", location_longitude AS "locationLongitude",
             visibility::text, status::text, assigned_provider_user_id AS "assignedProviderUserId",
             accepted_application_id AS "acceptedApplicationId", created_at AS "createdAt", updated_at AS "updatedAt" FROM changed
      """, nativeQuery = true)
  Map<String, Object> reopenJob(@Param("jobId") String jobId);

  @Query(value = """
      SELECT coalesce(nullif(trim(username), ''), 'member_' || substring(md5(id::text) FROM 1 FOR 10))
      FROM users WHERE id = cast(:userId as uuid)
      """, nativeQuery = true)
  String findPublicUserId(@Param("userId") String userId);
}
