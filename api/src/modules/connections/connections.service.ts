import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";

type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export interface CreateConnectionRequest {
  requesterUserId: string;
  targetUserId: string;
}

export interface ConnectionRecord {
  id: string;
  userAId: string;
  userBId: string;
  requestedByUserId: string;
  status: ConnectionStatus;
  requestedAt: string;
  decidedAt: string | null;
}

interface DbConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  requested_by_user_id: string;
  status: ConnectionStatus;
  requested_at: Date;
  decided_at: Date | null;
}

@Injectable()
export class ConnectionsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async request(input: CreateConnectionRequest): Promise<ConnectionRecord> {
    assertUuid(input.requesterUserId, "requesterUserId");
    assertUuid(input.targetUserId, "targetUserId");

    if (input.requesterUserId === input.targetUserId) {
      throw new BadRequestException("Requester and target cannot be the same user");
    }

    await this.assertUserExists(input.requesterUserId, "requesterUserId");
    await this.assertUserExists(input.targetUserId, "targetUserId");

    const [userAId, userBId] = [input.requesterUserId, input.targetUserId].sort();

    const existing = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      FROM connections
      WHERE user_a_id = $1::uuid AND user_b_id = $2::uuid
      `,
      [userAId, userBId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return this.mapRow(existing.rows[0]);
    }

    const inserted = await this.databaseService.query<DbConnectionRow>(
      `
      INSERT INTO connections (
        user_a_id,
        user_b_id,
        requested_by_user_id,
        status
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending'::connection_status)
      RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      `,
      [userAId, userBId, input.requesterUserId]
    );

    return this.mapRow(inserted.rows[0]);
  }

  async accept(connectionId: string, actorUserId: string): Promise<ConnectionRecord> {
    assertUuid(connectionId, "connectionId");
    assertUuid(actorUserId, "actorUserId");

    const existing = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      FROM connections
      WHERE id = $1::uuid
      `,
      [connectionId]
    );

    if (!existing.rowCount) {
      throw new NotFoundException("Connection not found");
    }

    const connection = existing.rows[0];
    const isParticipant =
      connection.user_a_id === actorUserId || connection.user_b_id === actorUserId;
    if (!isParticipant) {
      throw new BadRequestException("Actor is not part of this connection");
    }

    const updated = await this.databaseService.query<DbConnectionRow>(
      `
      UPDATE connections
      SET status = 'accepted'::connection_status,
          decided_at = now()
      WHERE id = $1::uuid
      RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      `,
      [connectionId]
    );

    return this.mapRow(updated.rows[0]);
  }

  async findById(connectionId: string): Promise<ConnectionRecord | undefined> {
    assertUuid(connectionId, "connectionId");

    const result = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      FROM connections
      WHERE id = $1::uuid
      `,
      [connectionId]
    );

    if (!result.rowCount) {
      return undefined;
    }

    return this.mapRow(result.rows[0]);
  }

  async list(actorUserId: string): Promise<ConnectionRecord[]> {
    assertUuid(actorUserId, "actorUserId");

    const result = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      FROM connections
      WHERE user_a_id = $1::uuid OR user_b_id = $1::uuid
      ORDER BY requested_at DESC
      `,
      [actorUserId]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: DbConnectionRow): ConnectionRecord {
    return {
      id: row.id,
      userAId: row.user_a_id,
      userBId: row.user_b_id,
      requestedByUserId: row.requested_by_user_id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      decidedAt: row.decided_at ? row.decided_at.toISOString() : null
    };
  }

  private async assertUserExists(userId: string, fieldName: string): Promise<void> {
    const result = await this.databaseService.query<{ id: string }>(
      `
      SELECT id
      FROM users
      WHERE id = $1::uuid
      `,
      [userId]
    );

    if (!result.rowCount) {
      throw new BadRequestException(`${fieldName} does not exist`);
    }
  }
}
