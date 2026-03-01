import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";

type UserRole = "both" | "seeker" | "provider" | "admin" | "support";
type ConsentRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type ConsentGrantStatus = "active" | "revoked";

interface DbMemberRow {
  id: string;
  public_user_id: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

interface DbAccessRequestRow {
  id: string;
  requester_public_user_id: string;
  owner_public_user_id: string;
  requested_fields: string[];
  purpose: string;
  status: ConsentRequestStatus;
  created_at: Date;
  resolved_at: Date | null;
}

interface DbGrantRow {
  id: string;
  owner_public_user_id: string;
  grantee_public_user_id: string;
  granted_fields: string[];
  purpose: string;
  status: ConsentGrantStatus;
  granted_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

interface DbAuditEventRow {
  id: string;
  event_type: string;
  purpose: string | null;
  metadata: Record<string, unknown>;
  actor_public_user_id: string | null;
  target_public_user_id: string | null;
  created_at: Date;
}

export interface AdminTimelineMember {
  userId: string;
  publicUserId: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTimelineAccessRequest {
  id: string;
  requesterUserId: string;
  ownerUserId: string;
  requestedFields: string[];
  purpose: string;
  status: ConsentRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminTimelineConsentGrant {
  id: string;
  ownerUserId: string;
  granteeUserId: string;
  grantedFields: string[];
  purpose: string;
  status: ConsentGrantStatus;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface AdminTimelineAuditEvent {
  id: string;
  eventType: string;
  purpose: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminMemberTimelineResponse {
  member: AdminTimelineMember;
  accessRequests: AdminTimelineAccessRequest[];
  consentGrants: AdminTimelineConsentGrant[];
  auditEvents: AdminTimelineAuditEvent[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminOversightService {
  constructor(private readonly databaseService: DatabaseService) { }

  async getMemberTimeline(input: {
    memberId: string;
    limit: number;
  }): Promise<AdminMemberTimelineResponse> {
    const member = await this.resolveMember(input.memberId);
    const limit = this.normalizeLimit(input.limit);

    const [accessRequests, consentGrants, auditEvents] = await Promise.all([
      this.listAccessRequests(member.userId, limit),
      this.listConsentGrants(member.userId, limit),
      this.listAuditEvents(member.userId, limit)
    ]);

    return {
      member,
      accessRequests,
      consentGrants,
      auditEvents
    };
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return 50;
    }
    return Math.min(Math.trunc(limit), 200);
  }

  private async resolveMember(memberId: string): Promise<AdminTimelineMember> {
    const normalized = memberId.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException("memberId is required");
    }

    const byId = UUID_PATTERN.test(normalized);
    const result = await this.databaseService.query<DbMemberRow>(
      `
      SELECT
        u.id::text AS id,
        COALESCE(NULLIF(TRIM(u.username), ''), 'member_' || SUBSTRING(md5(u.id::text) FROM 1 FOR 10)) AS public_user_id,
        u.role::text AS role,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE ${byId ? "u.id = $1::uuid" : "LOWER(u.username) = $1::text"}
      LIMIT 1
      `,
      [normalized]
    );

    if (!result.rowCount) {
      throw new NotFoundException("Member not found");
    }

    const row = result.rows[0];
    return {
      userId: row.id,
      publicUserId: row.public_user_id,
      role: row.role,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private async listAccessRequests(
    memberUserId: string,
    limit: number
  ): Promise<AdminTimelineAccessRequest[]> {
    const result = await this.databaseService.query<DbAccessRequestRow>(
      `
      SELECT
        r.id,
        COALESCE(NULLIF(TRIM(requester.username), ''), 'member_' || SUBSTRING(md5(r.requester_user_id::text) FROM 1 FOR 10)) AS requester_public_user_id,
        COALESCE(NULLIF(TRIM(owner.username), ''), 'member_' || SUBSTRING(md5(r.owner_user_id::text) FROM 1 FOR 10)) AS owner_public_user_id,
        r.requested_fields,
        r.purpose,
        r.status,
        r.created_at,
        r.resolved_at
      FROM pii_access_requests r
      JOIN users requester ON requester.id = r.requester_user_id
      JOIN users owner ON owner.id = r.owner_user_id
      WHERE r.requester_user_id = $1::uuid OR r.owner_user_id = $1::uuid
      ORDER BY r.created_at DESC
      LIMIT $2::int
      `,
      [memberUserId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      requesterUserId: row.requester_public_user_id,
      ownerUserId: row.owner_public_user_id,
      requestedFields: row.requested_fields,
      purpose: row.purpose,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null
    }));
  }

  private async listConsentGrants(
    memberUserId: string,
    limit: number
  ): Promise<AdminTimelineConsentGrant[]> {
    const result = await this.databaseService.query<DbGrantRow>(
      `
      SELECT
        g.id,
        COALESCE(NULLIF(TRIM(owner.username), ''), 'member_' || SUBSTRING(md5(g.owner_user_id::text) FROM 1 FOR 10)) AS owner_public_user_id,
        COALESCE(NULLIF(TRIM(grantee.username), ''), 'member_' || SUBSTRING(md5(g.grantee_user_id::text) FROM 1 FOR 10)) AS grantee_public_user_id,
        g.granted_fields,
        g.purpose,
        g.status,
        g.granted_at,
        g.expires_at,
        g.revoked_at,
        g.revoke_reason
      FROM pii_consent_grants g
      JOIN users owner ON owner.id = g.owner_user_id
      JOIN users grantee ON grantee.id = g.grantee_user_id
      WHERE g.owner_user_id = $1::uuid OR g.grantee_user_id = $1::uuid
      ORDER BY g.granted_at DESC
      LIMIT $2::int
      `,
      [memberUserId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      ownerUserId: row.owner_public_user_id,
      granteeUserId: row.grantee_public_user_id,
      grantedFields: row.granted_fields,
      purpose: row.purpose,
      status: row.status,
      grantedAt: row.granted_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      revokeReason: row.revoke_reason
    }));
  }

  private async listAuditEvents(
    memberUserId: string,
    limit: number
  ): Promise<AdminTimelineAuditEvent[]> {
    const result = await this.databaseService.query<DbAuditEventRow>(
      `
      SELECT
        ae.id,
        ae.event_type,
        ae.purpose,
        ae.metadata,
        CASE
          WHEN ae.actor_user_id IS NULL THEN NULL
          ELSE COALESCE(NULLIF(TRIM(actor.username), ''), 'member_' || SUBSTRING(md5(ae.actor_user_id::text) FROM 1 FOR 10))
        END AS actor_public_user_id,
        CASE
          WHEN ae.target_user_id IS NULL THEN NULL
          ELSE COALESCE(NULLIF(TRIM(target_user.username), ''), 'member_' || SUBSTRING(md5(ae.target_user_id::text) FROM 1 FOR 10))
        END AS target_public_user_id,
        ae.created_at
      FROM audit_events ae
      LEFT JOIN users actor ON actor.id = ae.actor_user_id
      LEFT JOIN users target_user ON target_user.id = ae.target_user_id
      WHERE ae.actor_user_id = $1::uuid OR ae.target_user_id = $1::uuid
      ORDER BY ae.created_at DESC
      LIMIT $2::int
      `,
      [memberUserId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      purpose: row.purpose,
      actorUserId: row.actor_public_user_id,
      targetUserId: row.target_public_user_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString()
    }));
  }
}
