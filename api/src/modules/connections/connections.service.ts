import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { escapeIlikeLiteral } from "../../common/utils/sql";
import { ConsentService } from "../consent/consent.service";
import { MediaService } from "../media/media.service";
import { NotificationService } from "../notifications/notification.service";
import type { ServiceSkill } from "../profiles/service-catalog";

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
  otherUser?: ConnectionPersonSummary;
}

export interface ConnectionSearchCandidate {
  userId: string;
  displayName: string;
  locationLabel: string | null;
  serviceCategories: string[];
  serviceSkills: ServiceSkill[];
  topSkills: string[];
  recentJobCategories: string[];
  recentLocations: string[];
  avatar: ConnectionAvatarSummary | null;
}

export interface ConnectionAvatarSummary {
  mediaId: string;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
}

export interface ConnectionPersonSummary {
  userId: string;
  displayName: string;
  locationLabel: string | null;
  serviceCategories: string[];
  serviceSkills: ServiceSkill[];
  topSkills: string[];
  avatar: ConnectionAvatarSummary | null;
}

interface DbConnectionRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  user_a_internal_id?: string;
  user_b_internal_id?: string;
  requested_by_user_id: string;
  status: ConnectionStatus;
  requested_at: Date;
  decided_at: Date | null;
  other_user_id?: string | null;
  other_first_name?: string | null;
  other_last_name?: string | null;
  other_city?: string | null;
  other_area?: string | null;
  other_service_categories?: string[] | null;
  other_service_skills?: ServiceSkill[] | null;
  other_avatar_media_id?: string | null;
  other_avatar_bucket_name?: string | null;
  other_avatar_object_key?: string | null;
}

interface DbConnectionSearchRow {
  internal_user_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  area: string | null;
  service_categories: string[] | null;
  service_skills: ServiceSkill[] | null;
  job_categories: string[] | null;
  job_locations: string[] | null;
  job_count: number;
  avatar_media_id: string | null;
  avatar_bucket_name: string | null;
  avatar_object_key: string | null;
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly consentService: ConsentService,
    private readonly notificationService: NotificationService,
    @Optional() private readonly mediaService?: MediaService
  ) { }

  async request(input: CreateConnectionRequest): Promise<ConnectionRecord> {
    assertUuid(input.requesterUserId, "requesterUserId");
    const targetUserId = await this.resolveTargetUserId(input);

    if (input.requesterUserId === targetUserId) {
      throw new BadRequestException("Requester and target cannot be the same user");
    }

    await this.assertInternalUserExists(input.requesterUserId, "requesterUserId");

    const [userAId, userBId] = [input.requesterUserId, targetUserId].sort();

    const existing = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT
        c.id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_a_id)), ''), 'member_' || SUBSTRING(md5(c.user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_b_id)), ''), 'member_' || SUBSTRING(md5(c.user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(c.requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        c.status,
        c.requested_at,
        c.decided_at
      FROM connections c
      WHERE c.user_a_id = $1::uuid AND c.user_b_id = $2::uuid
      `,
      [userAId, userBId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const existingConnection = existing.rows[0];
      if (existingConnection.status === "declined") {
        const reopened = await this.databaseService.query<DbConnectionRow>(
          `
          UPDATE connections
          SET status = 'pending'::connection_status,
              requested_by_user_id = $2::uuid,
              requested_at = now(),
              decided_at = NULL
          WHERE id = $1::uuid
          RETURNING
            id,
            COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_a_id)), ''), 'member_' || SUBSTRING(md5(user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
            COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_b_id)), ''), 'member_' || SUBSTRING(md5(user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
            COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
            status,
            requested_at,
            decided_at
          `,
          [existingConnection.id, input.requesterUserId]
        );

        return this.mapRow(reopened.rows[0]);
      }

      return this.mapRow(existingConnection);
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
      RETURNING
        id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_a_id)), ''), 'member_' || SUBSTRING(md5(user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_b_id)), ''), 'member_' || SUBSTRING(md5(user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        status,
        requested_at,
        decided_at
      `,
      [userAId, userBId, input.requesterUserId]
    );

    const record = this.mapRow(inserted.rows[0]);

    // Fire-and-forget: notify the target user about the connection request
    this.notificationService.create({
      userId: targetUserId,
      type: "connection_request_received",
      title: "New connection request",
      body: "Someone wants to connect with you.",
      data: { requesterUserId: input.requesterUserId, connectionId: record.id }
    }).catch((err) => this.logger.warn(`Notification failed: ${err.message}`));

    return record;
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
    if (connection.requested_by_user_id === actorUserId) {
      throw new BadRequestException("Cannot accept your own connection request");
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
      RETURNING
        id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_a_id)), ''), 'member_' || SUBSTRING(md5(user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_b_id)), ''), 'member_' || SUBSTRING(md5(user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        status,
        requested_at,
        decided_at
      `,
      [connectionId]
    );

    const record = this.mapRow(updated.rows[0]);

    // Fire-and-forget: notify the requester that their connection was accepted
    this.notificationService.create({
      userId: connection.requested_by_user_id,
      type: "connection_request_accepted",
      title: "Connection accepted",
      body: "Your connection request was accepted!",
      data: { acceptedByUserId: actorUserId, connectionId }
    }).catch((err) => this.logger.warn(`Notification failed: ${err.message}`));

    return record;
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
      RETURNING
        id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_a_id)), ''), 'member_' || SUBSTRING(md5(user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_b_id)), ''), 'member_' || SUBSTRING(md5(user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        status,
        requested_at,
        decided_at
      `,
      [connectionId]
    );

    const record = this.mapRow(updated.rows[0]);

    // Fire-and-forget: notify the requester that their connection was declined
    this.notificationService.create({
      userId: connection.requested_by_user_id,
      type: "connection_request_declined",
      title: "Connection declined",
      body: "Your connection request was declined.",
      data: { declinedByUserId: actorUserId, connectionId }
    }).catch((err) => this.logger.warn(`Notification failed: ${err.message}`));

    return record;
  }

  async block(connectionId: string, actorUserId: string): Promise<ConnectionRecord> {
    const connection = await this.assertParticipantAndLoad(connectionId, actorUserId);
    if (connection.status === "blocked") {
      const existing = await this.findById(connectionId);
      return existing ?? this.mapRow(connection);
    }

    const updated = await this.databaseService.query<DbConnectionRow>(
      `
      UPDATE connections
      SET status = 'blocked'::connection_status,
          decided_at = now()
      WHERE id = $1::uuid
      RETURNING
        id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_a_id)), ''), 'member_' || SUBSTRING(md5(user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = user_b_id)), ''), 'member_' || SUBSTRING(md5(user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        status,
        requested_at,
        decided_at
      `,
      [connectionId]
    );

    // Revoke all active consent grants for this connection
    const revokedCount = await this.consentService.revokeAllForConnection(
      connectionId,
      "Connection blocked by participant"
    );
    if (revokedCount > 0) {
      this.logger.log(`Revoked ${revokedCount} consent grant(s) for blocked connection ${connectionId}`);
    }

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
    const likePattern = `%${escapeIlikeLiteral(normalizedQuery)}%`;
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
          u.id AS internal_user_id,
          COALESCE(NULLIF(TRIM(u.username), ''), 'member_' || SUBSTRING(md5(u.id::text) FROM 1 FOR 10)) AS user_id,
          u.created_at,
          p.first_name,
          p.last_name,
          p.city,
          p.area,
          COALESCE(p.service_categories, '{}'::text[]) AS service_categories,
          COALESCE(p.service_skills, '[]'::jsonb) AS service_skills,
          COALESCE(job_agg.job_categories, '{}'::text[]) AS job_categories,
          COALESCE(job_agg.job_locations, '{}'::text[]) AS job_locations,
          COALESCE(job_agg.job_count, 0)::int AS job_count,
          avatar.id AS avatar_media_id,
          avatar.bucket_name AS avatar_bucket_name,
          avatar.object_key AS avatar_object_key,
          lower(
            concat_ws(
              ' ',
              COALESCE(NULLIF(TRIM(u.username), ''), 'member_' || SUBSTRING(md5(u.id::text) FROM 1 FOR 10)),
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
        LEFT JOIN media_assets avatar
          ON avatar.id = p.active_avatar_media_id
         AND avatar.state = 'approved'::media_state
        WHERE u.id <> $1::uuid
      )
      SELECT
        internal_user_id,
        user_id,
        first_name,
        last_name,
        city,
        area,
        service_categories,
        service_skills,
        job_categories,
        job_locations,
        job_count,
        avatar_media_id,
        avatar_bucket_name,
        avatar_object_key
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
          WHEN user_id = $2::text THEN 0
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

  async discoverCandidates(
    actorUserId: string,
    limit = 8
  ): Promise<ConnectionSearchCandidate[]> {
    assertUuid(actorUserId, "actorUserId");
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.trunc(limit), 20))
      : 8;

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
      )
      SELECT
        u.id AS internal_user_id,
        COALESCE(NULLIF(TRIM(u.username), ''), 'member_' || SUBSTRING(md5(u.id::text) FROM 1 FOR 10)) AS user_id,
        p.first_name,
        p.last_name,
        p.city,
        p.area,
        COALESCE(p.service_categories, '{}'::text[]) AS service_categories,
        COALESCE(p.service_skills, '[]'::jsonb) AS service_skills,
        COALESCE(job_agg.job_categories, '{}'::text[]) AS job_categories,
        COALESCE(job_agg.job_locations, '{}'::text[]) AS job_locations,
        COALESCE(job_agg.job_count, 0)::int AS job_count,
        avatar.id AS avatar_media_id,
        avatar.bucket_name AS avatar_bucket_name,
        avatar.object_key AS avatar_object_key
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN job_agg ON job_agg.user_id = u.id
      LEFT JOIN media_assets avatar
        ON avatar.id = p.active_avatar_media_id
       AND avatar.state = 'approved'::media_state
      WHERE u.id <> $1::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM connections c
          WHERE (c.user_a_id = $1::uuid AND c.user_b_id = u.id)
             OR (c.user_b_id = $1::uuid AND c.user_a_id = u.id)
        )
      ORDER BY random()
      LIMIT $2::int
      `,
      [actorUserId, safeLimit]
    );

    return result.rows.map((row) => this.mapSearchRow(row));
  }

  async findById(connectionId: string): Promise<ConnectionRecord | undefined> {
    assertUuid(connectionId, "connectionId");

    const result = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT
        c.id,
        c.user_a_id::text AS user_a_internal_id,
        c.user_b_id::text AS user_b_internal_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_a_id)), ''), 'member_' || SUBSTRING(md5(c.user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_b_id)), ''), 'member_' || SUBSTRING(md5(c.user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(c.requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        c.status,
        c.requested_at,
        c.decided_at
      FROM connections c
      WHERE c.id = $1::uuid
      `,
      [connectionId]
    );

    if (!result.rowCount) {
      return undefined;
    }

    return this.mapRow(result.rows[0]);
  }

  async list(
    actorUserId: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: ConnectionRecord[]; total: number; limit: number; offset: number }> {
    assertUuid(actorUserId, "actorUserId");
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, 100));
    const safeOffset = Math.max(0, Math.trunc(offset) || 0);

    const countResult = await this.databaseService.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM connections WHERE user_a_id = $1::uuid OR user_b_id = $1::uuid`,
      [actorUserId]
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const result = await this.databaseService.query<DbConnectionRow>(
      `
      SELECT
        c.id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_a_id)), ''), 'member_' || SUBSTRING(md5(c.user_a_id::text) FROM 1 FOR 10)) AS user_a_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.user_b_id)), ''), 'member_' || SUBSTRING(md5(c.user_b_id::text) FROM 1 FOR 10)) AS user_b_id,
        COALESCE(NULLIF(TRIM((SELECT username FROM users WHERE id = c.requested_by_user_id)), ''), 'member_' || SUBSTRING(md5(c.requested_by_user_id::text) FROM 1 FOR 10)) AS requested_by_user_id,
        c.status,
        c.requested_at,
        c.decided_at
      FROM connections c
      WHERE c.user_a_id = $1::uuid OR c.user_b_id = $1::uuid
      ORDER BY c.requested_at DESC
      LIMIT $2::int OFFSET $3::int
      `,
      [actorUserId, safeLimit, safeOffset]
    );

    const records = await this.enrichConnectionsWithOtherUser(result.rows, actorUserId);

    return {
      items: records,
      total,
      limit: safeLimit,
      offset: safeOffset
    };
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

  private async resolveTargetUserId(input: CreateConnectionRequest): Promise<string> {
    const targetUserId = input.targetUserId?.trim();
    if (targetUserId) {
      return this.resolveInternalUserId(targetUserId, "targetUserId");
    }

    const targetQuery = input.targetQuery?.trim();
    if (!targetQuery) {
      throw new BadRequestException("Provide targetUserId or targetQuery");
    }

    if (this.looksLikeUuid(targetQuery)) {
      return this.resolveInternalUserId(targetQuery, "targetQuery");
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

    return this.resolveInternalUserId(matches[0].userId, "targetQuery");
  }

  private mapRow(row: DbConnectionRow): ConnectionRecord {
    return {
      id: row.id,
      userAId: row.user_a_id,
      userBId: row.user_b_id,
      requestedByUserId: row.requested_by_user_id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
      otherUser:
        row.other_user_id != null
          ? this.mapPersonSummary({
            internalUserId: row.other_user_id,
            userId: row.other_user_id,
            firstName: row.other_first_name ?? null,
            lastName: row.other_last_name ?? null,
            city: row.other_city ?? null,
            area: row.other_area ?? null,
            serviceCategories: row.other_service_categories ?? [],
            serviceSkills: row.other_service_skills ?? [],
            avatarMediaId: row.other_avatar_media_id ?? null,
            avatarBucketName: row.other_avatar_bucket_name ?? null,
            avatarObjectKey: row.other_avatar_object_key ?? null
          })
          : undefined
    };
  }

  private mapSearchRow(row: DbConnectionSearchRow): ConnectionSearchCandidate {
    const summary = this.mapPersonSummary({
      internalUserId: row.internal_user_id,
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      city: row.city,
      area: row.area,
      serviceCategories: row.service_categories ?? [],
      serviceSkills: row.service_skills ?? [],
      avatarMediaId: row.avatar_media_id,
      avatarBucketName: row.avatar_bucket_name,
      avatarObjectKey: row.avatar_object_key
    });

    return {
      ...summary,
      recentJobCategories: row.job_categories ?? [],
      recentLocations: row.job_locations ?? []
    };
  }

  private async enrichConnectionsWithOtherUser(
    rows: DbConnectionRow[],
    actorUserId: string
  ): Promise<ConnectionRecord[]> {
    const internalIds = rows
      .map((row) =>
        row.user_a_internal_id === actorUserId ? row.user_b_internal_id : row.user_a_internal_id
      )
      .filter((value): value is string => typeof value === "string");

    if (internalIds.length === 0) {
      return rows.map((row) => this.mapRow(row));
    }

    const summaries = await this.loadPersonSummaries(internalIds);
    return rows.map((row) => {
      const otherInternalId =
        row.user_a_internal_id === actorUserId ? row.user_b_internal_id : row.user_a_internal_id;
      if (otherInternalId) {
        const summary = summaries[otherInternalId];
        if (summary) {
          return {
            ...this.mapRow(row),
            otherUser: summary
          };
        }
      }
      return this.mapRow(row);
    });
  }

  private async loadPersonSummaries(
    internalUserIds: string[]
  ): Promise<Record<string, ConnectionPersonSummary>> {
    const uniqueIds = [...new Set(internalUserIds)];
    if (uniqueIds.length === 0) {
      return {};
    }

    const result = await this.databaseService.query<{
      internal_user_id: string;
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
      area: string | null;
      service_categories: string[] | null;
      service_skills: ServiceSkill[] | null;
      avatar_media_id: string | null;
      avatar_bucket_name: string | null;
      avatar_object_key: string | null;
    }>(
      `
      SELECT
        u.id::text AS internal_user_id,
        COALESCE(NULLIF(TRIM(u.username), ''), 'member_' || SUBSTRING(md5(u.id::text) FROM 1 FOR 10)) AS user_id,
        p.first_name,
        p.last_name,
        p.city,
        p.area,
        COALESCE(p.service_categories, '{}'::text[]) AS service_categories,
        COALESCE(p.service_skills, '[]'::jsonb) AS service_skills,
        avatar.id AS avatar_media_id,
        avatar.bucket_name AS avatar_bucket_name,
        avatar.object_key AS avatar_object_key
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN media_assets avatar
        ON avatar.id = p.active_avatar_media_id
       AND avatar.state = 'approved'::media_state
      WHERE u.id = ANY($1::uuid[])
      `,
      [uniqueIds]
    );

    return Object.fromEntries(
      result.rows.map((row) => [
        row.internal_user_id,
        this.mapPersonSummary({
          internalUserId: row.internal_user_id,
          userId: row.user_id,
          firstName: row.first_name,
          lastName: row.last_name,
          city: row.city,
          area: row.area,
          serviceCategories: row.service_categories ?? [],
          serviceSkills: row.service_skills ?? [],
          avatarMediaId: row.avatar_media_id,
          avatarBucketName: row.avatar_bucket_name,
          avatarObjectKey: row.avatar_object_key
        })
      ])
    );
  }

  private mapPersonSummary(input: {
    internalUserId: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    area: string | null;
    serviceCategories: string[];
    serviceSkills: ServiceSkill[];
    avatarMediaId: string | null;
    avatarBucketName: string | null;
    avatarObjectKey: string | null;
  }): ConnectionPersonSummary {
    const displayName = [input.firstName, input.lastName]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(" ");
    const locationLabel = [input.area, input.city]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(", ");
    const avatar =
      input.avatarMediaId && input.avatarBucketName && input.avatarObjectKey
        ? (() => {
          if (!this.mediaService) {
            return null;
          }
          const signed = this.mediaService.createDownloadUrl({
            bucketName: input.avatarBucketName,
            objectKey: input.avatarObjectKey
          });
          return {
            mediaId: input.avatarMediaId,
            downloadUrl: signed.downloadUrl,
            downloadUrlExpiresAt: signed.downloadUrlExpiresAt
          };
        })()
        : null;

    return {
      userId: input.userId,
      displayName: displayName.length > 0 ? displayName : `Member ${input.userId.slice(0, 8)}`,
      locationLabel: locationLabel.length > 0 ? locationLabel : null,
      serviceCategories: input.serviceCategories,
      serviceSkills: input.serviceSkills,
      topSkills: input.serviceSkills
        .slice(0, 3)
        .map((skill) => `${skill.jobName} (${skill.proficiency})`),
      avatar
    };
  }

  private looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  }

  private async assertInternalUserExists(userId: string, fieldName: string): Promise<void> {
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

  private async resolveInternalUserId(identifier: string, fieldName: string): Promise<string> {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (this.looksLikeUuid(normalized)) {
      await this.assertInternalUserExists(normalized, fieldName);
      return normalized;
    }

    const byUsername = await this.databaseService.query<{ id: string }>(
      `
      SELECT id::text AS id
      FROM users
      WHERE LOWER(username) = $1::text
      LIMIT 1
      `,
      [normalized]
    );
    if (!byUsername.rowCount) {
      throw new NotFoundException(`${fieldName} does not exist`);
    }
    return byUsername.rows[0].id;
  }

}
