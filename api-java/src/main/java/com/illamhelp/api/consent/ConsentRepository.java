package com.illamhelp.api.consent;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsentRepository extends JpaRepository<ConsentGrantEntity, UUID> {
  @Query(value = """
      SELECT id, user_a_id AS "userAId", user_b_id AS "userBId", status::text
      FROM connections WHERE id = cast(:connectionId as uuid)
      """, nativeQuery = true)
  Map<String, Object> connectionForConsent(@Param("connectionId") String connectionId);

  @Query(value = """
      SELECT id, requester_user_id AS "requesterUserId", owner_user_id AS "ownerUserId", connection_id AS "connectionId",
             requested_fields AS "requestedFields", purpose, status::text, created_at AS "createdAt"
      FROM pii_access_requests
      WHERE requester_user_id = cast(:userId as uuid) OR owner_user_id = cast(:userId as uuid)
      ORDER BY created_at DESC
      """, nativeQuery = true)
  List<Map<String, Object>> requests(@Param("userId") String userId);

  @Query(value = """
      SELECT id, access_request_id AS "accessRequestId", owner_user_id AS "ownerUserId", grantee_user_id AS "granteeUserId",
             connection_id AS "connectionId", granted_fields AS "grantedFields", purpose, status::text,
             granted_at AS "grantedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
      FROM pii_consent_grants
      WHERE owner_user_id = cast(:userId as uuid) OR grantee_user_id = cast(:userId as uuid)
      ORDER BY granted_at DESC
      """, nativeQuery = true)
  List<Map<String, Object>> grants(@Param("userId") String userId);

  @Query(value = """
      WITH created AS (
        INSERT INTO pii_access_requests (requester_user_id, owner_user_id, connection_id, requested_fields, purpose)
        VALUES (cast(:requesterUserId as uuid), cast(:ownerUserId as uuid), cast(:connectionId as uuid),
                cast(:requestedFields as text[]), :purpose)
        RETURNING id, requester_user_id, owner_user_id, connection_id, requested_fields, purpose, status, created_at
      )
      SELECT id, requester_user_id AS "requesterUserId", owner_user_id AS "ownerUserId", connection_id AS "connectionId",
             requested_fields AS "requestedFields", purpose, status::text, created_at AS "createdAt" FROM created
      """, nativeQuery = true)
  Map<String, Object> insertAccessRequest(@Param("requesterUserId") String requesterUserId, @Param("ownerUserId") String ownerUserId,
      @Param("connectionId") Object connectionId, @Param("requestedFields") String[] requestedFields, @Param("purpose") Object purpose);

  @Query(value = """
      SELECT id, requester_user_id AS "requesterUserId", owner_user_id AS "ownerUserId",
             connection_id AS "connectionId", requested_fields AS "requestedFields", purpose, status::text
      FROM pii_access_requests WHERE id = cast(:requestId as uuid)
      """, nativeQuery = true)
  Map<String, Object> findAccessRequest(@Param("requestId") String requestId);

  @Query(value = """
      WITH changed AS (
        UPDATE pii_access_requests SET status = 'approved', resolved_at = now()
        WHERE id = cast(:requestId as uuid) AND owner_user_id = cast(:ownerUserId as uuid)
        RETURNING requester_user_id, owner_user_id, connection_id, requested_fields, purpose
      )
      SELECT requester_user_id, owner_user_id, connection_id, requested_fields, purpose FROM changed
      """, nativeQuery = true)
  Map<String, Object> approveAccessRequest(@Param("requestId") String requestId, @Param("ownerUserId") String ownerUserId);

  @Query(value = """
      SELECT EXISTS (
        SELECT 1 FROM pii_consent_grants
        WHERE owner_user_id = cast(:ownerUserId as uuid) AND grantee_user_id = cast(:granteeUserId as uuid)
          AND connection_id = cast(:connectionId as uuid) AND status = 'active'::pii_grant_status
          AND (expires_at IS NULL OR expires_at > now())
      )
      """, nativeQuery = true)
  boolean hasActiveGrant(@Param("ownerUserId") String ownerUserId, @Param("granteeUserId") String granteeUserId,
      @Param("connectionId") String connectionId);

  @Query(value = """
      WITH created AS (
        INSERT INTO pii_consent_grants (access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, expires_at)
        VALUES (cast(:requestId as uuid), cast(:ownerUserId as uuid), cast(:requesterUserId as uuid),
                cast(:connectionId as uuid), cast(:grantedFields as text[]), :purpose, cast(:expiresAt as timestamptz))
        RETURNING id, access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose,
                  status, granted_at, expires_at, revoked_at, revoke_reason
      )
      SELECT id, access_request_id AS "accessRequestId", owner_user_id AS "ownerUserId", grantee_user_id AS "granteeUserId",
             connection_id AS "connectionId", granted_fields AS "grantedFields", purpose, status::text,
             granted_at AS "grantedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
      FROM created
      """, nativeQuery = true)
  Map<String, Object> insertGrant(@Param("requestId") String requestId, @Param("ownerUserId") Object ownerUserId,
      @Param("requesterUserId") Object requesterUserId, @Param("connectionId") Object connectionId,
      @Param("grantedFields") Object grantedFields, @Param("purpose") Object purpose, @Param("expiresAt") String expiresAt);

  @Query(value = """
      WITH changed AS (
        UPDATE pii_consent_grants SET status = 'revoked', revoked_at = now(), revoke_reason = cast(:reason as text)
        WHERE id = cast(:grantId as uuid) AND owner_user_id = cast(:ownerUserId as uuid)
        RETURNING id, access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose,
                  status, granted_at, expires_at, revoked_at, revoke_reason
      )
      SELECT id, access_request_id AS "accessRequestId", owner_user_id AS "ownerUserId", grantee_user_id AS "granteeUserId",
             connection_id AS "connectionId", granted_fields AS "grantedFields", purpose, status::text,
             granted_at AS "grantedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
      FROM changed
      """, nativeQuery = true)
  Map<String, Object> revokeGrant(@Param("grantId") String grantId, @Param("ownerUserId") String ownerUserId, @Param("reason") Object reason);

  @Query(value = """
      WITH revoked AS (
        UPDATE pii_consent_grants SET status = 'revoked', revoked_at = now(), revoke_reason = :reason
        WHERE connection_id = cast(:connectionId as uuid) AND status = 'active'::pii_grant_status
        RETURNING id, owner_user_id, grantee_user_id
      )
      SELECT id, owner_user_id AS "ownerUserId", grantee_user_id AS "granteeUserId" FROM revoked
      """, nativeQuery = true)
  List<Map<String, Object>> revokeActiveForConnection(@Param("connectionId") String connectionId,
      @Param("reason") String reason);

  @Query(value = """
      SELECT g.status::text AS grant_status, g.granted_fields, g.expires_at, c.status::text AS relationship_status
      FROM pii_consent_grants g JOIN connections c ON c.id = g.connection_id
      WHERE g.owner_user_id = cast(:ownerUserId as uuid) AND g.grantee_user_id = cast(:viewerUserId as uuid)
        AND g.status = 'active' AND :field = any(granted_fields)
        AND (g.expires_at IS NULL OR g.expires_at > now())
      ORDER BY g.granted_at DESC LIMIT 1
      """, nativeQuery = true)
  List<Map<String, Object>> activeGrant(@Param("ownerUserId") String ownerUserId, @Param("viewerUserId") String viewerUserId,
      @Param("field") String field);

  @Query(value = "SELECT username FROM users WHERE id = cast(:userId as uuid)", nativeQuery = true)
  String findUsername(@Param("userId") String userId);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findUserIdByUsername(@Param("identifier") String identifier);
}
