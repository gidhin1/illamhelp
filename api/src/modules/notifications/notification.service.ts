import { Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";

type NotificationType =
    | "job_application_received"
    | "job_application_accepted"
    | "job_application_rejected"
    | "job_booking_started"
    | "job_booking_completed"
    | "job_booking_cancelled"
    | "connection_request_received"
    | "connection_request_accepted"
    | "connection_request_declined"
    | "verification_approved"
    | "verification_rejected"
    | "consent_grant_received"
    | "consent_grant_revoked"
    | "media_approved"
    | "media_rejected"
    | "system_announcement";

interface DbNotificationRow {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Record<string, unknown>;
    read: boolean;
    read_at: Date | null;
    created_at: Date;
}

export interface NotificationRecord {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Record<string, unknown>;
    read: boolean;
    readAt: string | null;
    createdAt: string;
}

export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

interface ListNotificationsInput {
    userId: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
}

@Injectable()
export class NotificationService {
    constructor(private readonly databaseService: DatabaseService) { }

    async create(input: CreateNotificationInput): Promise<NotificationRecord> {
        assertUuid(input.userId, "userId");

        const result = await this.databaseService.query<DbNotificationRow>(
            `
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES ($1::uuid, $2::notification_type, $3, $4, $5::jsonb)
      RETURNING *
      `,
            [
                input.userId,
                input.type,
                input.title,
                input.body,
                JSON.stringify(input.data ?? {})
            ]
        );

        return this.mapRow(result.rows[0]);
    }

    async createBatch(inputs: CreateNotificationInput[]): Promise<number> {
        if (!inputs.length) return 0;

        const values: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        for (const input of inputs) {
            assertUuid(input.userId, "userId");
            values.push(
                `($${paramIndex}::uuid, $${paramIndex + 1}::notification_type, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}::jsonb)`
            );
            params.push(
                input.userId,
                input.type,
                input.title,
                input.body,
                JSON.stringify(input.data ?? {})
            );
            paramIndex += 5;
        }

        const result = await this.databaseService.query(
            `
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES ${values.join(", ")}
      `,
            params
        );

        return result.rowCount ?? 0;
    }

    async list(input: ListNotificationsInput): Promise<{
        items: NotificationRecord[];
        total: number;
        limit: number;
        offset: number;
        unreadCount: number;
    }> {
        assertUuid(input.userId, "userId");

        const safeLimit = Math.min(Math.max(input.limit ?? 50, 1), 100);
        const safeOffset = Math.max(input.offset ?? 0, 0);

        const conditions: string[] = ["user_id = $1::uuid"];
        const params: unknown[] = [input.userId];
        let paramIndex = 2;

        if (input.unreadOnly) {
            conditions.push("read = false");
        }

        const whereClause = conditions.join(" AND ");

        const [countResult, unreadResult, dataResult] = await Promise.all([
            this.databaseService.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM notifications WHERE ${whereClause}`,
                params
            ),
            this.databaseService.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1::uuid AND read = false`,
                [input.userId]
            ),
            this.databaseService.query<DbNotificationRow>(
                `
        SELECT * FROM notifications
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1}
        `,
                [...params, safeLimit, safeOffset]
            )
        ]);

        return {
            items: dataResult.rows.map((row) => this.mapRow(row)),
            total: parseInt(countResult.rows[0]?.count ?? "0", 10),
            limit: safeLimit,
            offset: safeOffset,
            unreadCount: parseInt(unreadResult.rows[0]?.count ?? "0", 10)
        };
    }

    async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
        assertUuid(userId, "userId");

        const result = await this.databaseService.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1::uuid AND read = false`,
            [userId]
        );

        return {
            unreadCount: parseInt(result.rows[0]?.count ?? "0", 10)
        };
    }

    async markRead(notificationId: string, userId: string): Promise<NotificationRecord> {
        assertUuid(notificationId, "notificationId");
        assertUuid(userId, "userId");

        const result = await this.databaseService.query<DbNotificationRow>(
            `
      UPDATE notifications
      SET read = true, read_at = now()
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING *
      `,
            [notificationId, userId]
        );

        if (!result.rowCount) {
            throw new NotFoundException("Notification not found");
        }

        return this.mapRow(result.rows[0]);
    }

    async markAllRead(userId: string): Promise<{ updated: number }> {
        assertUuid(userId, "userId");

        const result = await this.databaseService.query(
            `
      UPDATE notifications
      SET read = true, read_at = now()
      WHERE user_id = $1::uuid AND read = false
      `,
            [userId]
        );

        return { updated: result.rowCount ?? 0 };
    }

    private mapRow(row: DbNotificationRow): NotificationRecord {
        return {
            id: row.id,
            userId: row.user_id,
            type: row.type,
            title: row.title,
            body: row.body,
            data: row.data ?? {},
            read: row.read,
            readAt: row.read_at?.toISOString() ?? null,
            createdAt: row.created_at.toISOString()
        };
    }
}
