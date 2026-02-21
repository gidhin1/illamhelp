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
  ) {}

  async requestAccess(input: AccessRequestInput): Promise<AccessRequestRecord> {
    this.assertAccessRequestInput(input);

    const connection = await this.getConnection(input.connectionId);
    if (!connection || connection.status !== "accepted") {
      throw new BadRequestException(
        "Mutual accepted connection is required before PII access request"
      );
    }

    const isParticipant =
      connection.user_a_id === input.requesterUserId ||
      connection.user_b_id === input.requesterUserId;
    if (!isParticipant) {
      throw new BadRequestException("Requester is not part of the connection");
    }

    const ownerIsParticipant =
      connection.user_a_id === input.ownerUserId ||
      connection.user_b_id === input.ownerUserId;
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
        input.requesterUserId,
        input.ownerUserId,
        input.connectionId,
        input.requestedFields,
        input.purpose
      ]
    );

    const record = this.mapAccessRequestRow(result.rows[0]);
    await this.auditService.logEvent({
      actorUserId: record.requesterUserId,
      targetUserId: record.ownerUserId,
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
    assertUuid(input.ownerUserId, "ownerUserId");
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
    if (request.owner_user_id !== input.ownerUserId) {
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

    const grantRecord = this.mapGrantRow(grantResult.rows[0]);
    await this.auditService.logEvent({
      actorUserId: grantRecord.ownerUserId,
      targetUserId: grantRecord.granteeUserId,
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
    assertUuid(input.ownerUserId, "ownerUserId");

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
    if (grant.owner_user_id !== input.ownerUserId) {
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

    const revokedRecord = this.mapGrantRow(updated.rows[0]);
    await this.auditService.logEvent({
      actorUserId: revokedRecord.ownerUserId,
      targetUserId: revokedRecord.granteeUserId,
      eventType: "pii_access_revoked",
      purpose: "user_revocation",
      metadata: {
        grantId: revokedRecord.id,
        reason: revokedRecord.revokeReason
      }
    });

    return revokedRecord;
  }

  async canView(input: AccessCheckInput): Promise<{ allowed: boolean }> {
    assertUuid(input.actorUserId, "actorUserId");
    assertUuid(input.ownerUserId, "ownerUserId");
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
      ORDER BY g.granted_at DESC
      LIMIT 1
      `,
      [input.ownerUserId, input.actorUserId, input.field]
    );

    if (!result.rowCount) {
      await this.auditService.logEvent({
        actorUserId: input.actorUserId,
        targetUserId: input.ownerUserId,
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
      actor_id: input.actorUserId,
      owner_id: input.ownerUserId,
      field: input.field,
      relationship_status: grant.relationship_status,
      grant: grantInput
    });

    await this.auditService.logEvent({
      actorUserId: input.actorUserId,
      targetUserId: input.ownerUserId,
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
    assertUuid(actorUserId, "actorUserId");

    const result = await this.databaseService.query<DbAccessRequestRow>(
      `
      SELECT id, requester_user_id, owner_user_id, connection_id, requested_fields, purpose, status, created_at
      FROM pii_access_requests
      WHERE requester_user_id = $1::uuid OR owner_user_id = $1::uuid
      ORDER BY created_at DESC
      `,
      [actorUserId]
    );

    return result.rows.map((row) => this.mapAccessRequestRow(row));
  }

  async listGrants(actorUserId: string): Promise<ConsentGrantRecord[]> {
    assertUuid(actorUserId, "actorUserId");

    const result = await this.databaseService.query<DbGrantRow>(
      `
      SELECT access_request_id, id, owner_user_id, grantee_user_id, connection_id, granted_fields, purpose, status, granted_at, expires_at, revoked_at, revoke_reason
      FROM pii_consent_grants
      WHERE owner_user_id = $1::uuid OR grantee_user_id = $1::uuid
      ORDER BY granted_at DESC
      `,
      [actorUserId]
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
    assertUuid(input.requesterUserId, "requesterUserId");
    assertUuid(input.ownerUserId, "ownerUserId");
    assertUuid(input.connectionId, "connectionId");

    if (input.requesterUserId === input.ownerUserId) {
      throw new BadRequestException("Requester and owner must be different users");
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

  private mapAccessRequestRow(row: DbAccessRequestRow): AccessRequestRecord {
    return {
      id: row.id,
      requesterUserId: row.requester_user_id,
      ownerUserId: row.owner_user_id,
      connectionId: row.connection_id,
      requestedFields: row.requested_fields,
      purpose: row.purpose,
      status: row.status,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapGrantRow(row: DbGrantRow): ConsentGrantRecord {
    return {
      id: row.id,
      accessRequestId: row.access_request_id,
      ownerUserId: row.owner_user_id,
      granteeUserId: row.grantee_user_id,
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
}
