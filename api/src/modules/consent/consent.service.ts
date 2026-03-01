import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { OpaService } from "../../common/policy/opa.service";
import { assertUuid } from "../../common/utils/uuid";
import { AuditService } from "../audit/audit.service";
import { ConsentField } from "./dto/consent-field.enum";

type AccessRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type GrantStatus = "active" | "revoked";
type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

const CONSENT_FIELDS: ConsentField[] = Object.values(ConsentField);

export interface AccessRequestInput {
  requesterUserId: string;
  ownerUserId: string;
  connectionId: string;
  requestedFields: ConsentField[];
  purpose: string;
}

export interface GrantRequestInput {
  ownerUserId: string;
  grantedFields: ConsentField[];
  expiresAt?: string;
  purpose: string;
}

export interface RevokeGrantInput {
  ownerUserId: string;
  reason: string;
}

export interface AccessCheckInput {
  actorUserId: string;
  ownerUserId: string;
  field: ConsentField;
}

export interface AccessRequestRecord {
  id: string;
  requesterUserId: string;
  ownerUserId: string;
  connectionId: string;
  requestedFields: ConsentField[];
  purpose: string;
  status: AccessRequestStatus;
  createdAt: string;
}

export interface ConsentGrantRecord {
  id: string;
  accessRequestId: string | null;
  ownerUserId: string;
  granteeUserId: string;
  connectionId: string;
  grantedFields: ConsentField[];
  purpose: string;
  status: GrantStatus;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

interface DbConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: ConnectionStatus;
}

interface DbAccessRequestRow {
  id: string;
  requester_user_id: string;
  owner_user_id: string;
  requester_public_user_id?: string | null;
  owner_public_user_id?: string | null;
  connection_id: string;
  requested_fields: ConsentField[];
  purpose: string;
  status: AccessRequestStatus;
  created_at: Date;
}

interface DbGrantRow {
  access_request_id: string | null;
  id: string;
  owner_user_id: string;
  grantee_user_id: string;
  owner_public_user_id?: string | null;
  grantee_public_user_id?: string | null;
  connection_id: string;
  granted_fields: ConsentField[];
  purpose: string;
  status: GrantStatus;
  granted_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

interface DbCanViewRow {
  relationship_status: ConnectionStatus;
  grant_status: GrantStatus;
  granted_fields: ConsentField[];
  expires_at: Date | null;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly opaService: OpaService,
    private readonly auditService: AuditService
  ) { }

  async requestAccess(input: AccessRequestInput): Promise<AccessRequestRecord> {
    this.assertAccessRequestInput(input);
    const requesterInternalUserId = await this.resolveInternalUserId(
      input.requesterUserId,
      "requesterUserId"
    );
    const ownerInternalUserId = await this.resolveInternalUserId(
      input.ownerUserId,
      "ownerUserId"
    );
    if (requesterInternalUserId === ownerInternalUserId) {
      throw new BadRequestException("Requester and owner must be different users");
    }

    const connection = await this.getConnection(input.connectionId);
    if (!connection || connection.status !== "accepted") {
      throw new BadRequestException(
        "Mutual accepted connection is required before PII access request"
      );
    }

    const isParticipant =
      connection.user_a_id === requesterInternalUserId ||
      connection.user_b_id === requesterInternalUserId;
    if (!isParticipant) {
      throw new BadRequestException("Requester is not part of the connection");
    }

    const ownerIsParticipant =
      connection.user_a_id === ownerInternalUserId ||
      connection.user_b_id === ownerInternalUserId;
    if (!ownerIsParticipant) {
      throw new BadRequestException("Owner is not part of the connection");
    }

    const result = await this.databaseService.query<DbAccessRequestRow>(
      `
      INSERT INTO pii_access_requests (
        requester_user_id,
        owner_user_id,
        connection_id,
        requested_fields,
        purpose,
        status
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text[], $5, 'pending'::pii_request_status)
      RETURNING id, requester_user_id, owner_user_id, connection_id, requested_fields, purpose, status, created_at
      `,
      [
        requesterInternalUserId,
        ownerInternalUserId,
        input.connectionId,
        input.requestedFields,
        input.purpose
      ]
    );

    const record = this.mapAccessRequestRow(result.rows[0], {
      requesterPublicUserId: await this.resolvePublicUserId(requesterInternalUserId),
      ownerPublicUserId: await this.resolvePublicUserId(ownerInternalUserId)
    });
    await this.auditService.logEvent({
      actorUserId: requesterInternalUserId,
      targetUserId: ownerInternalUserId,
      eventType: "pii_access_requested",
      purpose: record.purpose,
      metadata: {
        requestId: record.id,
        connectionId: record.connectionId,
        requestedFields: record.requestedFields
      }
    });

    return record;
  }

  async grant(requestId: string, input: GrantRequestInput): Promise<ConsentGrantRecord> {
    assertUuid(requestId, "requestId");
    const ownerInternalUserId = await this.resolveInternalUserId(
      input.ownerUserId,
      "ownerUserId"
    );
    this.assertFields(input.grantedFields, "grantedFields");

    const accessRequest = await this.databaseService.query<DbAccessRequestRow>(
      `
      SELECT id, requester_user_id, owner_user_id, connection_id, requested_fields, purpose, status, created_at
      FROM pii_access_requests
      WHERE id = $1::uuid
      `,
      [requestId]
    );

    if (!accessRequest.rowCount) {
      throw new NotFoundException("Access request not found");
    }

    const request = accessRequest.rows[0];
    if (request.owner_user_id !== ownerInternalUserId) {
      throw new BadRequestException("Only owner can grant PII access");
    }

    const nonRequestedField = input.grantedFields.find(
      (field) => !request.requested_fields.includes(field)
    );
    if (nonRequestedField) {
      throw new BadRequestException(
        `Granted field was not requested: ${nonRequestedField}`
      );
    }

    const existingGrant = await this.databaseService.query<{ id: string }>(
      `
      SELECT id::text AS id
      FROM pii_consent_grants
      WHERE owner_user_id = $1::uuid
        AND grantee_user_id = $2::uuid
        AND connection_id = $3::uuid
        AND status = 'active'::pii_grant_status
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
      `,
      [request.owner_user_id, request.requester_user_id, request.connection_id]
    );
    if (existingGrant.rowCount) {
      throw new BadRequestException(
        "An active consent grant already exists for this connection. Revoke it first or wait for it to expire."
      );
    }

    await this.databaseService.query(
      `
      UPDATE pii_access_requests
      SET status = 'approved'::pii_request_status,
          resolved_at = now()
      WHERE id = $1::uuid
      `,
      [requestId]
    );

    const grantResult = await this.databaseService.query<DbGrantRow>(
      `
      INSERT INTO pii_consent_grants (
        access_request_id,
        owner_user_id,
        grantee_user_id,
        connection_id,
        granted_fields,
        status,
        purpose,
        expires_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text[], 'active'::pii_grant_status, $6, $7::timestamptz)
      RETURNING access_request_id, id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, status, granted_at, expires_at, revoked_at, revoke_reason
      `,
      [
        request.id,
        request.owner_user_id,
        request.requester_user_id,
        request.connection_id,
        input.grantedFields,
        input.purpose,
        input.expiresAt ?? null
      ]
    );

    const grantRecord = this.mapGrantRow(grantResult.rows[0], {
      ownerPublicUserId: await this.resolvePublicUserId(request.owner_user_id),
      granteePublicUserId: await this.resolvePublicUserId(request.requester_user_id)
    });
    await this.auditService.logEvent({
      actorUserId: request.owner_user_id,
      targetUserId: request.requester_user_id,
      eventType: "pii_access_granted",
      purpose: grantRecord.purpose,
      metadata: {
        requestId: request.id,
        grantId: grantRecord.id,
        grantedFields: grantRecord.grantedFields,
        expiresAt: grantRecord.expiresAt
      }
    });

    return grantRecord;
  }

  async revoke(grantId: string, input: RevokeGrantInput): Promise<ConsentGrantRecord> {
    assertUuid(grantId, "grantId");
    const ownerInternalUserId = await this.resolveInternalUserId(
      input.ownerUserId,
      "ownerUserId"
    );

    const grantQuery = await this.databaseService.query<DbGrantRow>(
      `
      SELECT access_request_id, id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, status, granted_at, expires_at, revoked_at, revoke_reason
      FROM pii_consent_grants
      WHERE id = $1::uuid
      `,
      [grantId]
    );

    if (!grantQuery.rowCount) {
      throw new NotFoundException("Consent grant not found");
    }

    const grant = grantQuery.rows[0];
    if (grant.owner_user_id !== ownerInternalUserId) {
      throw new BadRequestException("Only owner can revoke consent");
    }

    const updated = await this.databaseService.query<DbGrantRow>(
      `
      UPDATE pii_consent_grants
      SET status = 'revoked'::pii_grant_status,
          revoked_at = now(),
          revoke_reason = $2
      WHERE id = $1::uuid
      RETURNING access_request_id, id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, status, granted_at, expires_at, revoked_at, revoke_reason
      `,
      [grantId, input.reason]
    );

    const revokedRecord = this.mapGrantRow(updated.rows[0], {
      ownerPublicUserId: await this.resolvePublicUserId(grant.owner_user_id),
      granteePublicUserId: await this.resolvePublicUserId(grant.grantee_user_id)
    });
    await this.auditService.logEvent({
      actorUserId: grant.owner_user_id,
      targetUserId: grant.grantee_user_id,
      eventType: "pii_access_revoked",
      purpose: "user_revocation",
      metadata: {
        grantId: revokedRecord.id,
        reason: revokedRecord.revokeReason
      }
    });

    return revokedRecord;
  }

  async revokeAllForConnection(connectionId: string, reason: string): Promise<number> {
    assertUuid(connectionId, "connectionId");

    const result = await this.databaseService.query<DbGrantRow>(
      `
      UPDATE pii_consent_grants
      SET status = 'revoked'::pii_grant_status,
          revoked_at = now(),
          revoke_reason = $2
      WHERE connection_id = $1::uuid
        AND status = 'active'::pii_grant_status
      RETURNING access_request_id, id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, status, granted_at, expires_at, revoked_at, revoke_reason
      `,
      [connectionId, reason]
    );

    // Audit each revoked grant
    for (const row of result.rows) {
      await this.auditService.logEvent({
        actorUserId: row.owner_user_id,
        targetUserId: row.grantee_user_id,
        eventType: "pii_access_revoked",
        purpose: "connection_blocked",
        metadata: {
          grantId: row.id,
          connectionId,
          reason
        }
      });
    }

    return result.rowCount ?? 0;
  }

  async canView(input: AccessCheckInput): Promise<{ allowed: boolean }> {
    const actorInternalUserId = await this.resolveInternalUserId(
      input.actorUserId,
      "actorUserId"
    );
    const ownerInternalUserId = await this.resolveInternalUserId(
      input.ownerUserId,
      "ownerUserId"
    );
    this.assertFields([input.field], "field");

    const result = await this.databaseService.query<DbCanViewRow>(
      `
      SELECT
        c.status AS relationship_status,
        g.status AS grant_status,
        g.granted_fields,
        g.expires_at
      FROM pii_consent_grants g
      INNER JOIN connections c ON c.id = g.connection_id
      WHERE g.owner_user_id = $1::uuid
        AND g.grantee_user_id = $2::uuid
        AND g.status = 'active'::pii_grant_status
        AND $3 = ANY(g.granted_fields)
        AND (g.expires_at IS NULL OR g.expires_at > now())
      ORDER BY g.granted_at DESC
      LIMIT 1
      `,
      [ownerInternalUserId, actorInternalUserId, input.field]
    );

    if (!result.rowCount) {
      await this.auditService.logEvent({
        actorUserId: actorInternalUserId,
        targetUserId: ownerInternalUserId,
        eventType: "pii_access_checked",
        purpose: "consent_read_path",
        metadata: {
          field: input.field,
          allowed: false,
          reason: "no_active_grant"
        }
      });
      return { allowed: false };
    }

    const grant = result.rows[0];
    const grantInput: {
      status: GrantStatus;
      granted_fields: ConsentField[];
      expires_at?: string;
    } = {
      status: grant.grant_status,
      granted_fields: grant.granted_fields
    };
    if (grant.expires_at) {
      grantInput.expires_at = grant.expires_at.toISOString();
    }

    const allowed = await this.opaService.canViewPii({
      actor_id: actorInternalUserId,
      owner_id: ownerInternalUserId,
      field: input.field,
      relationship_status: grant.relationship_status,
      grant: grantInput
    });

    await this.auditService.logEvent({
      actorUserId: actorInternalUserId,
      targetUserId: ownerInternalUserId,
      eventType: "pii_access_checked",
      purpose: "consent_read_path",
      metadata: {
        field: input.field,
        allowed
      }
    });

    return { allowed };
  }

  async listRequests(actorUserId: string): Promise<AccessRequestRecord[]> {
    const actorInternalUserId = await this.resolveInternalUserId(
      actorUserId,
      "actorUserId"
    );

    const result = await this.databaseService.query<DbAccessRequestRow>(
      `
      SELECT
        r.id,
        r.requester_user_id,
        r.owner_user_id,
        COALESCE(NULLIF(TRIM(requester.username), ''), 'member_' || SUBSTRING(md5(r.requester_user_id::text) FROM 1 FOR 10)) AS requester_public_user_id,
        COALESCE(NULLIF(TRIM(owner.username), ''), 'member_' || SUBSTRING(md5(r.owner_user_id::text) FROM 1 FOR 10)) AS owner_public_user_id,
        r.connection_id,
        r.requested_fields,
        r.purpose,
        r.status,
        r.created_at
      FROM pii_access_requests r
      JOIN users requester ON requester.id = r.requester_user_id
      JOIN users owner ON owner.id = r.owner_user_id
      WHERE r.requester_user_id = $1::uuid OR r.owner_user_id = $1::uuid
      ORDER BY created_at DESC
      `,
      [actorInternalUserId]
    );

    return result.rows.map((row) => this.mapAccessRequestRow(row));
  }

  async listGrants(actorUserId: string): Promise<ConsentGrantRecord[]> {
    const actorInternalUserId = await this.resolveInternalUserId(
      actorUserId,
      "actorUserId"
    );

    const result = await this.databaseService.query<DbGrantRow>(
      `
      SELECT
        g.access_request_id,
        g.id,
        g.owner_user_id,
        g.grantee_user_id,
        COALESCE(NULLIF(TRIM(owner.username), ''), 'member_' || SUBSTRING(md5(g.owner_user_id::text) FROM 1 FOR 10)) AS owner_public_user_id,
        COALESCE(NULLIF(TRIM(grantee.username), ''), 'member_' || SUBSTRING(md5(g.grantee_user_id::text) FROM 1 FOR 10)) AS grantee_public_user_id,
        g.connection_id,
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
      ORDER BY granted_at DESC
      `,
      [actorInternalUserId]
    );

    return result.rows.map((row) => this.mapGrantRow(row));
  }

  private async getConnection(connectionId: string): Promise<DbConnectionRow | undefined> {
    const result = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT id, user_a_id, user_b_id, status
      FROM connections
      WHERE id = $1::uuid
      `,
      [connectionId]
    );

    if (!result.rowCount) {
      return undefined;
    }

    return result.rows[0];
  }

  private assertAccessRequestInput(input: AccessRequestInput): void {
    if (!input.requesterUserId || input.requesterUserId.trim().length < 3) {
      throw new BadRequestException("requesterUserId is required");
    }
    assertUuid(input.connectionId, "connectionId");
    if (!input.ownerUserId || input.ownerUserId.trim().length < 3) {
      throw new BadRequestException("ownerUserId is required");
    }

    this.assertFields(input.requestedFields, "requestedFields");
  }

  private assertFields(fields: string[], fieldName: string): void {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestException(`${fieldName} must include at least one field`);
    }

    const invalidField = fields.find((field) => !CONSENT_FIELDS.includes(field as ConsentField));
    if (invalidField) {
      throw new BadRequestException(`Unsupported consent field: ${invalidField}`);
    }
  }

  private mapAccessRequestRow(
    row: DbAccessRequestRow,
    overrides?: { requesterPublicUserId?: string; ownerPublicUserId?: string }
  ): AccessRequestRecord {
    return {
      id: row.id,
      requesterUserId:
        overrides?.requesterPublicUserId ??
        row.requester_public_user_id ??
        this.toPublicUserId(row.requester_user_id),
      ownerUserId:
        overrides?.ownerPublicUserId ??
        row.owner_public_user_id ??
        this.toPublicUserId(row.owner_user_id),
      connectionId: row.connection_id,
      requestedFields: row.requested_fields,
      purpose: row.purpose,
      status: row.status,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapGrantRow(
    row: DbGrantRow,
    overrides?: { ownerPublicUserId?: string; granteePublicUserId?: string }
  ): ConsentGrantRecord {
    return {
      id: row.id,
      accessRequestId: row.access_request_id,
      ownerUserId:
        overrides?.ownerPublicUserId ??
        row.owner_public_user_id ??
        this.toPublicUserId(row.owner_user_id),
      granteeUserId:
        overrides?.granteePublicUserId ??
        row.grantee_public_user_id ??
        this.toPublicUserId(row.grantee_user_id),
      connectionId: row.connection_id,
      grantedFields: row.granted_fields,
      purpose: row.purpose,
      status: row.status,
      grantedAt: row.granted_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      revokeReason: row.revoke_reason
    };
  }

  private async resolveInternalUserId(identifier: string, fieldName: string): Promise<string> {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      const exists = await this.databaseService.query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE id = $1::uuid LIMIT 1`,
        [normalized]
      );
      if (!exists.rowCount) {
        throw new NotFoundException(`${fieldName} does not exist`);
      }
      return normalized;
    }

    const result = await this.databaseService.query<{ id: string }>(
      `
      SELECT id::text AS id
      FROM users
      WHERE LOWER(username) = $1::text
      LIMIT 1
      `,
      [normalized]
    );
    if (!result.rowCount) {
      throw new NotFoundException(`${fieldName} does not exist`);
    }
    return result.rows[0].id;
  }

  private async resolvePublicUserId(internalUserId: string): Promise<string> {
    const result = await this.databaseService.query<{ username: string | null }>(
      `
      SELECT username
      FROM users
      WHERE id = $1::uuid
      `,
      [internalUserId]
    );
    if (!result.rowCount) {
      return this.toPublicUserId(internalUserId);
    }
    return this.toPublicUserId(internalUserId, result.rows[0].username);
  }

  private toPublicUserId(internalUserId: string, username?: string | null): string {
    const normalized = username?.trim().toLowerCase() ?? "";
    if (normalized.length >= 3) {
      return normalized;
    }
    return `member_${internalUserId.replace(/-/g, "").slice(0, 10).toLowerCase()}`;
  }
}
