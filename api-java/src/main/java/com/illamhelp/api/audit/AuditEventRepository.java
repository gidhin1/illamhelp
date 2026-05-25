package com.illamhelp.api.audit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditEventRepository extends JpaRepository<AuditEventEntity, UUID> {
  @Query(value = """
      SELECT id AS "userId", username AS "publicUserId", role::text AS role,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users WHERE id = cast(:memberId as uuid)
      """, nativeQuery = true)
  Map<String, Object> memberById(@Param("memberId") String memberId);

  @Query(value = """
      SELECT id AS "userId", username AS "publicUserId", role::text AS role,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM users WHERE lower(username) = lower(:memberId)
      """, nativeQuery = true)
  Map<String, Object> memberByUsername(@Param("memberId") String memberId);

  @Query(value = """
      SELECT r.id, requester.username AS "requesterUserId", owner.username AS "ownerUserId",
             r.requested_fields AS "requestedFields", r.purpose, r.status::text,
             r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
      FROM pii_access_requests r
      JOIN users requester ON requester.id = r.requester_user_id JOIN users owner ON owner.id = r.owner_user_id
      WHERE r.requester_user_id = cast(:userId as uuid) OR r.owner_user_id = cast(:userId as uuid)
      ORDER BY r.created_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> accessRequests(@Param("userId") String userId, @Param("limit") int limit);

  @Query(value = """
      SELECT g.id, owner.username AS "ownerUserId", grantee.username AS "granteeUserId",
             g.granted_fields AS "grantedFields", g.purpose, g.status::text,
             g.granted_at AS "grantedAt", g.expires_at AS "expiresAt",
             g.revoked_at AS "revokedAt", g.revoke_reason AS "revokeReason"
      FROM pii_consent_grants g
      JOIN users owner ON owner.id = g.owner_user_id JOIN users grantee ON grantee.id = g.grantee_user_id
      WHERE g.owner_user_id = cast(:userId as uuid) OR g.grantee_user_id = cast(:userId as uuid)
      ORDER BY g.granted_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> consentGrants(@Param("userId") String userId, @Param("limit") int limit);

  @Query(value = """
      SELECT ae.id, ae.event_type AS "eventType", ae.purpose, actor.username AS "actorUserId",
             target.username AS "targetUserId", ae.metadata::text AS metadata, ae.created_at AS "createdAt"
      FROM audit_events ae LEFT JOIN users actor ON actor.id = ae.actor_user_id LEFT JOIN users target ON target.id = ae.target_user_id
      WHERE ae.actor_user_id = cast(:userId as uuid) OR ae.target_user_id = cast(:userId as uuid)
      ORDER BY ae.created_at DESC LIMIT :limit
      """, nativeQuery = true)
  List<Map<String, Object>> timelineEvents(@Param("userId") String userId, @Param("limit") int limit);
}
