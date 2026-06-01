package com.illamhelp.api.consent;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsentRepository extends JpaRepository<ConsentGrantEntity, UUID> {
  @Query(value = """
      SELECT id::text AS id, user_a_id::text AS "userAId", user_b_id::text AS "userBId", status::text
      FROM connections WHERE id = cast(:connectionId as uuid)
      """, nativeQuery = true)
  ConnectionForConsentRow connectionForConsent(@Param("connectionId") String connectionId);

  @Query(value = """
      SELECT r.id::text AS id, r.requester_user_id::text AS "requesterUserId", r.owner_user_id::text AS "ownerUserId", r.connection_id::text AS "connectionId",
             r.requested_fields AS "requestedFields", r.purpose, r.status::text, r.created_at::text AS "createdAt",
             requester.username AS "requesterPublicUserId", owner.username AS "ownerPublicUserId"
      FROM pii_access_requests r JOIN users requester ON requester.id = r.requester_user_id
      JOIN users owner ON owner.id = r.owner_user_id
      WHERE (r.requester_user_id = cast(:userId as uuid) OR r.owner_user_id = cast(:userId as uuid))
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (r.created_at, r.id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY r.created_at DESC, r.id DESC LIMIT :limit
      """, nativeQuery = true)
  List<AccessRequestRow> requests(@Param("userId") String userId, @Param("cursorCreatedAt") String cursorCreatedAt,
      @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      SELECT g.id::text AS id, g.access_request_id::text AS "accessRequestId", g.owner_user_id::text AS "ownerUserId", g.grantee_user_id::text AS "granteeUserId",
             g.connection_id::text AS "connectionId", g.granted_fields AS "grantedFields", g.purpose, g.status::text,
             g.granted_at::text AS "grantedAt", g.expires_at::text AS "expiresAt", g.revoked_at::text AS "revokedAt", g.revoke_reason AS "revokeReason",
             owner.username AS "ownerPublicUserId", grantee.username AS "granteePublicUserId"
      FROM pii_consent_grants g JOIN users owner ON owner.id = g.owner_user_id
      JOIN users grantee ON grantee.id = g.grantee_user_id
      WHERE (g.owner_user_id = cast(:userId as uuid) OR g.grantee_user_id = cast(:userId as uuid))
        AND (cast(:cursorCreatedAt as text) IS NULL
          OR (g.granted_at, g.id) < (cast(:cursorCreatedAt as timestamptz), cast(:cursorId as uuid)))
      ORDER BY g.granted_at DESC, g.id DESC LIMIT :limit
      """, nativeQuery = true)
  List<GrantRow> grants(@Param("userId") String userId, @Param("cursorCreatedAt") String cursorCreatedAt,
      @Param("cursorId") String cursorId, @Param("limit") int limit);

  @Query(value = """
      WITH created AS (
        INSERT INTO pii_access_requests (requester_user_id, owner_user_id, connection_id, requested_fields, purpose)
        VALUES (cast(:requesterUserId as uuid), cast(:ownerUserId as uuid), cast(:connectionId as uuid),
                cast(:requestedFields as text[]), :purpose)
        RETURNING id, requester_user_id, owner_user_id, connection_id, requested_fields, purpose, status, created_at
      )
      SELECT id::text AS id, requester_user_id::text AS "requesterUserId", owner_user_id::text AS "ownerUserId", connection_id::text AS "connectionId",
             requested_fields AS "requestedFields", purpose, status::text, created_at::text AS "createdAt" FROM created
      """, nativeQuery = true)
  AccessRequestRow insertAccessRequest(@Param("requesterUserId") String requesterUserId, @Param("ownerUserId") String ownerUserId,
      @Param("connectionId") Object connectionId, @Param("requestedFields") String[] requestedFields, @Param("purpose") Object purpose);

  @Query(value = """
      SELECT id::text AS id, requester_user_id::text AS "requesterUserId", owner_user_id::text AS "ownerUserId",
             connection_id::text AS "connectionId", requested_fields AS "requestedFields", purpose, status::text
      FROM pii_access_requests WHERE id = cast(:requestId as uuid)
      """, nativeQuery = true)
  AccessRequestCoreRow findAccessRequest(@Param("requestId") String requestId);

  @Query(value = """
      WITH expired AS (
        UPDATE pii_consent_grants SET status = 'revoked'::pii_grant_status, revoked_at = now(), revoke_reason = 'expired'
        WHERE owner_user_id = cast(:ownerUserId as uuid) AND status = 'active'::pii_grant_status
          AND expires_at IS NOT NULL AND expires_at <= now()
      ), approved AS (
        UPDATE pii_access_requests SET status = 'approved'::pii_request_status, resolved_at = now()
        WHERE id = cast(:requestId as uuid) AND owner_user_id = cast(:ownerUserId as uuid)
          AND status = 'pending'::pii_request_status
        RETURNING requester_user_id, owner_user_id, connection_id
      ), created AS (
        INSERT INTO pii_consent_grants (access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, expires_at)
        SELECT cast(:requestId as uuid), approved.owner_user_id, approved.requester_user_id, approved.connection_id,
               cast(:grantedFields as text[]), :purpose, cast(:expiresAt as timestamptz)
        FROM approved
        WHERE NOT EXISTS (
          SELECT 1 FROM pii_consent_grants active
          WHERE active.owner_user_id = approved.owner_user_id
            AND active.grantee_user_id = approved.requester_user_id
            AND active.connection_id = approved.connection_id
            AND active.status = 'active'::pii_grant_status
            AND (active.expires_at IS NULL OR active.expires_at > now())
        )
        ON CONFLICT (owner_user_id, grantee_user_id, connection_id)
          WHERE status = 'active'::pii_grant_status DO NOTHING
        RETURNING id, access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose,
                  status, granted_at, expires_at, revoked_at, revoke_reason
      )
      SELECT id::text AS id, access_request_id::text AS "accessRequestId", owner_user_id::text AS "ownerUserId", grantee_user_id::text AS "granteeUserId",
             connection_id::text AS "connectionId", granted_fields AS "grantedFields", purpose, status::text,
             granted_at::text AS "grantedAt", expires_at::text AS "expiresAt", revoked_at::text AS "revokedAt", revoke_reason AS "revokeReason"
      FROM created
      """, nativeQuery = true)
  GrantRow grantPendingRequest(@Param("requestId") String requestId, @Param("ownerUserId") String ownerUserId,
      @Param("grantedFields") String[] grantedFields, @Param("purpose") Object purpose, @Param("expiresAt") String expiresAt);

  @Query(value = """
      WITH changed AS (
        UPDATE pii_consent_grants SET status = 'revoked', revoked_at = now(), revoke_reason = cast(:reason as text)
        WHERE id = cast(:grantId as uuid) AND owner_user_id = cast(:ownerUserId as uuid)
        RETURNING id, access_request_id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose,
                  status, granted_at, expires_at, revoked_at, revoke_reason
      )
      SELECT id::text AS id, access_request_id::text AS "accessRequestId", owner_user_id::text AS "ownerUserId", grantee_user_id::text AS "granteeUserId",
             connection_id::text AS "connectionId", granted_fields AS "grantedFields", purpose, status::text,
             granted_at::text AS "grantedAt", expires_at::text AS "expiresAt", revoked_at::text AS "revokedAt", revoke_reason AS "revokeReason"
      FROM changed
      """, nativeQuery = true)
  GrantRow revokeGrant(@Param("grantId") String grantId, @Param("ownerUserId") String ownerUserId, @Param("reason") Object reason);

  @Query(value = """
      WITH revoked AS (
        UPDATE pii_consent_grants SET status = 'revoked', revoked_at = now(), revoke_reason = :reason
        WHERE connection_id = cast(:connectionId as uuid) AND status = 'active'::pii_grant_status
        RETURNING id, owner_user_id, grantee_user_id
      )
      SELECT id::text AS id, owner_user_id::text AS "ownerUserId", grantee_user_id::text AS "granteeUserId" FROM revoked
      """, nativeQuery = true)
  List<RevokedGrantRow> revokeActiveForConnection(@Param("connectionId") String connectionId,
      @Param("reason") String reason);

  @Query(value = """
      SELECT g.status::text AS "grantStatus", g.granted_fields AS "grantedFields", g.expires_at::text AS "expiresAt",
             c.status::text AS "relationshipStatus"
      FROM pii_consent_grants g JOIN connections c ON c.id = g.connection_id
      WHERE g.owner_user_id = cast(:ownerUserId as uuid) AND g.grantee_user_id = cast(:viewerUserId as uuid)
        AND g.status = 'active' AND :field = any(granted_fields)
        AND (g.expires_at IS NULL OR g.expires_at > now())
      ORDER BY g.granted_at DESC LIMIT 1
      """, nativeQuery = true)
  List<ActiveGrantRow> activeGrant(@Param("ownerUserId") String ownerUserId, @Param("viewerUserId") String viewerUserId,
      @Param("field") String field);

  @Query(value = "SELECT username FROM users WHERE id = cast(:userId as uuid)", nativeQuery = true)
  String findUsername(@Param("userId") String userId);

  @Query(value = "SELECT id::text FROM users WHERE lower(username) = lower(:identifier) LIMIT 1", nativeQuery = true)
  String findUserIdByUsername(@Param("identifier") String identifier);

  interface ConnectionForConsentRow {
    String getUserAId();
    String getUserBId();
    String getStatus();
  }

  interface AccessRequestRow extends AccessRequestCoreRow {
    String getCreatedAt();
    String getRequesterPublicUserId();
    String getOwnerPublicUserId();
  }

  interface AccessRequestCoreRow {
    String getId();
    String getRequesterUserId();
    String getOwnerUserId();
    String getConnectionId();
    Object getRequestedFields();
    String getPurpose();
    String getStatus();
  }

  interface GrantRow {
    String getId();
    String getAccessRequestId();
    String getOwnerUserId();
    String getGranteeUserId();
    String getConnectionId();
    Object getGrantedFields();
    String getPurpose();
    String getStatus();
    String getGrantedAt();
    String getExpiresAt();
    String getRevokedAt();
    String getRevokeReason();
    String getOwnerPublicUserId();
    String getGranteePublicUserId();
  }

  interface RevokedGrantRow {
    String getId();
    String getOwnerUserId();
    String getGranteeUserId();
  }

  interface ActiveGrantRow {
    String getGrantStatus();
    Object getGrantedFields();
    String getExpiresAt();
    String getRelationshipStatus();
  }
}
