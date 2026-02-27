import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";

type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export interface CreateConnectionRequest {
  requesterUserId: string;
  targetUserId?: string;
  targetQuery?: string;
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

export interface ConnectionSearchCandidate {
  userId: string;
  displayName: string;
  locationLabel: string | null;
  serviceCategories: string[];
  recentJobCategories: string[];
  recentLocations: string[];
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

interface DbConnectionSearchRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  area: string | null;
  service_categories: string[] | null;
  job_categories: string[] | null;
  job_locations: string[] | null;
  job_count: number;
}

@Injectable()
export class ConnectionsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async request(input: CreateConnectionRequest): Promise<ConnectionRecord> {
    assertUuid(input.requesterUserId, "requesterUserId");
    const targetUserId = await this.resolveTargetUserId(input);
    assertUuid(targetUserId, "targetUserId");

    if (input.requesterUserId === targetUserId) {
      throw new BadRequestException("Requester and target cannot be the same user");
    }

    await this.assertUserExists(input.requesterUserId, "requesterUserId");
    await this.assertUserExists(targetUserId, "targetUserId");

    const [userAId, userBId] = [input.requesterUserId, targetUserId].sort();

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
    if (connection.status !== "pending") {
      throw new BadRequestException("Only pending connections can be accepted");
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

  async decline(connectionId: string, actorUserId: string): Promise<ConnectionRecord> {
    const connection = await this.assertParticipantAndLoad(connectionId, actorUserId);
    if (connection.status !== "pending") {
      throw new BadRequestException("Only pending connections can be declined");
    }

    const updated = await this.databaseService.query<DbConnectionRow>(
      `
      UPDATE connections
      SET status = 'declined'::connection_status,
          decided_at = now()
      WHERE id = $1::uuid
      RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      `,
      [connectionId]
    );

    return this.mapRow(updated.rows[0]);
  }

  async block(connectionId: string, actorUserId: string): Promise<ConnectionRecord> {
    const connection = await this.assertParticipantAndLoad(connectionId, actorUserId);
    if (connection.status === "blocked") {
      return this.mapRow(connection);
    }

    const updated = await this.databaseService.query<DbConnectionRow>(
      `
      UPDATE connections
      SET status = 'blocked'::connection_status,
          decided_at = now()
      WHERE id = $1::uuid
      RETURNING id, user_a_id, user_b_id, requested_by_user_id, status, requested_at, decided_at
      `,
      [connectionId]
    );

    return this.mapRow(updated.rows[0]);
  }

  async searchCandidates(
    actorUserId: string,
    query?: string,
    limit = 8
  ): Promise<ConnectionSearchCandidate[]> {
    assertUuid(actorUserId, "actorUserId");

    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.trunc(limit), 20))
      : 8;
    const normalizedQuery = query?.trim().toLowerCase() ?? "";
    const likePattern = `%${normalizedQuery}%`;
    const tokens = normalizedQuery
      .split(/[\s,;|/]+/)
      .map((value) => value.trim())
      .filter((value) => value.length >= 2);

    const result = await this.databaseService.query<DbConnectionSearchRow>(
      `
      WITH job_agg AS (
        SELECT
          j.seeker_user_id AS user_id,
          array_remove(array_agg(DISTINCT j.category), NULL) AS job_categories,
          array_remove(array_agg(DISTINCT j.location_text), NULL) AS job_locations,
          COUNT(*)::int AS job_count
        FROM jobs j
        GROUP BY j.seeker_user_id
      ),
      base AS (
        SELECT
          u.id AS user_id,
          u.created_at,
          p.first_name,
          p.last_name,
          p.city,
          p.area,
          COALESCE(p.service_categories, '{}'::text[]) AS service_categories,
          COALESCE(job_agg.job_categories, '{}'::text[]) AS job_categories,
          COALESCE(job_agg.job_locations, '{}'::text[]) AS job_locations,
          COALESCE(job_agg.job_count, 0)::int AS job_count,
          lower(
            concat_ws(
              ' ',
              u.id::text,
              COALESCE(p.first_name, ''),
              COALESCE(p.last_name, ''),
              COALESCE(p.city, ''),
              COALESCE(p.area, ''),
              array_to_string(COALESCE(p.service_categories, '{}'::text[]), ' '),
              array_to_string(COALESCE(job_agg.job_categories, '{}'::text[]), ' '),
              array_to_string(COALESCE(job_agg.job_locations, '{}'::text[]), ' ')
            )
          ) AS searchable_text
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN job_agg ON job_agg.user_id = u.id
        WHERE u.id <> $1::uuid
      )
      SELECT
        user_id,
        first_name,
        last_name,
        city,
        area,
        service_categories,
        job_categories,
        job_locations,
        job_count
      FROM base
      WHERE
        $2::text = ''
        OR searchable_text LIKE $3::text
        OR (
          cardinality($4::text[]) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::text[]) AS token
            WHERE searchable_text NOT LIKE ('%' || token || '%')
          )
        )
      ORDER BY
        CASE
          WHEN user_id::text = $2::text THEN 0
          WHEN searchable_text LIKE $3::text THEN 1
          ELSE 2
        END,
        job_count DESC,
        created_at DESC
      LIMIT $5::int
      `,
      [actorUserId, normalizedQuery, likePattern, tokens, safeLimit]
    );

    return result.rows.map((row) => this.mapSearchRow(row));
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

  private async assertParticipantAndLoad(
    connectionId: string,
    actorUserId: string
  ): Promise<DbConnectionRow> {
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

    return connection;
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

  private async resolveTargetUserId(input: CreateConnectionRequest): Promise<string> {
    const targetUserId = input.targetUserId?.trim();
    if (targetUserId) {
      return targetUserId;
    }

    const targetQuery = input.targetQuery?.trim();
    if (!targetQuery) {
      throw new BadRequestException("Provide targetUserId or targetQuery");
    }

    if (this.looksLikeUuid(targetQuery)) {
      return targetQuery;
    }

    const matches = await this.searchCandidates(input.requesterUserId, targetQuery, 6);
    if (matches.length === 0) {
      throw new NotFoundException(
        "No matching member found. Try name, member ID, service, or location."
      );
    }

    if (matches.length > 1) {
      throw new BadRequestException(
        "Multiple members matched this search. Please refine with name + location or use member ID."
      );
    }

    return matches[0].userId;
  }

  private mapSearchRow(row: DbConnectionSearchRow): ConnectionSearchCandidate {
    const displayName = [row.first_name, row.last_name]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(" ");

    const locationLabel = [row.area, row.city]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(", ");

    return {
      userId: row.user_id,
      displayName: displayName.length > 0 ? displayName : `Member ${row.user_id.slice(0, 8)}`,
      locationLabel: locationLabel.length > 0 ? locationLabel : null,
      serviceCategories: row.service_categories ?? [],
      recentJobCategories: row.job_categories ?? [],
      recentLocations: row.job_locations ?? []
    };
  }

  private looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
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
