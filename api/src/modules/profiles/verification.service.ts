import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Optional
} from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { assertUuid } from "../../common/utils/uuid";
import { AuditService } from "../audit/audit.service";
import { MediaService } from "../media/media.service";
import { NotificationService } from "../notifications/notification.service";
import { ProfilesService } from "./profiles.service";

type VerificationStatus = "pending" | "under_review" | "approved" | "rejected";

interface DbVerificationRow {
    id: string;
    user_id: string;
    document_media_ids: string[];
    document_type: string;
    notes: string | null;
    status: VerificationStatus;
    reviewer_user_id: string | null;
    reviewer_notes: string | null;
    reviewed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface VerificationRecord {
    id: string;
    userId: string;
    documentMediaIds: string[];
    documentType: string;
    notes: string | null;
    status: VerificationStatus;
    reviewerUserId: string | null;
    reviewerNotes: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface SubmitVerificationInput {
    actorUserId: string;
    documentType: string;
    documentMediaIds: string[];
    notes?: string;
}

interface ReviewVerificationInput {
    actorUserId: string;
    decision: "approved" | "rejected";
    notes?: string;
}

interface ListVerificationsInput {
    status?: VerificationStatus;
    limit?: number;
    offset?: number;
}

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly auditService: AuditService,
        private readonly profilesService: ProfilesService,
        private readonly notificationService: NotificationService,
        @Optional() private readonly mediaService?: MediaService
    ) { }

    async submit(input: SubmitVerificationInput): Promise<VerificationRecord> {
        assertUuid(input.actorUserId, "actorUserId");

        if (!input.documentMediaIds.length) {
            throw new BadRequestException("At least one document media ID is required");
        }

        for (const mediaId of input.documentMediaIds) {
            assertUuid(mediaId, "documentMediaIds");
        }

        // Check for existing active request (DB constraint will also enforce this)
        const existing = await this.databaseService.query<{ id: string }>(
            `
      SELECT id FROM verification_requests
      WHERE user_id = $1::uuid
        AND status IN ('pending', 'under_review')
      LIMIT 1
      `,
            [input.actorUserId]
        );

        if (existing.rowCount) {
            throw new BadRequestException(
                "You already have a pending verification request. Please wait for it to be reviewed."
            );
        }

        const result = await this.databaseService.query<DbVerificationRow>(
            `
      INSERT INTO verification_requests (
        user_id,
        document_media_ids,
        document_type,
        notes
      )
      VALUES (
        $1::uuid,
        $2::uuid[],
        $3::text,
        $4::text
      )
      RETURNING *
      `,
            [
                input.actorUserId,
                input.documentMediaIds,
                input.documentType.trim(),
                input.notes?.trim() || null
            ]
        );

        const record = this.mapRow(result.rows[0]);

        await this.mediaService
            ?.markVerificationDocuments(input.actorUserId, input.documentMediaIds)
            .catch(() => undefined);

        await this.auditService.logEvent({
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
            eventType: "verification_request_submitted",
            metadata: {
                verificationRequestId: record.id,
                documentType: record.documentType,
                documentCount: record.documentMediaIds.length
            }
        });

        return record;
    }

    async getMyVerification(userId: string): Promise<VerificationRecord | null> {
        assertUuid(userId, "userId");

        const result = await this.databaseService.query<DbVerificationRow>(
            `
      SELECT * FROM verification_requests
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
      `,
            [userId]
        );

        if (!result.rowCount) {
            return null;
        }

        return this.mapRow(result.rows[0]);
    }

    async listForAdmin(input: ListVerificationsInput): Promise<{
        items: VerificationRecord[];
        total: number;
        limit: number;
        offset: number;
    }> {
        const safeLimit = Math.min(Math.max(input.limit ?? 50, 1), 100);
        const safeOffset = Math.max(input.offset ?? 0, 0);

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (input.status) {
            conditions.push(`status = $${paramIndex}::verification_status`);
            params.push(input.status);
            paramIndex++;
        }

        const whereClause = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const [countResult, dataResult] = await Promise.all([
            this.databaseService.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM verification_requests ${whereClause}`,
                params
            ),
            this.databaseService.query<DbVerificationRow>(
                `
        SELECT * FROM verification_requests
        ${whereClause}
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
            offset: safeOffset
        };
    }

    async review(
        requestId: string,
        input: ReviewVerificationInput
    ): Promise<VerificationRecord> {
        assertUuid(requestId, "requestId");
        assertUuid(input.actorUserId, "actorUserId");

        const existing = await this.databaseService.query<DbVerificationRow>(
            `SELECT * FROM verification_requests WHERE id = $1::uuid`,
            [requestId]
        );

        if (!existing.rowCount) {
            throw new NotFoundException("Verification request not found");
        }

        const request = existing.rows[0];

        if (request.status !== "pending" && request.status !== "under_review") {
            throw new BadRequestException(
                `Cannot review a verification request in '${request.status}' status`
            );
        }

        const result = await this.databaseService.query<DbVerificationRow>(
            `
      UPDATE verification_requests
      SET
        status = $2::verification_status,
        reviewer_user_id = $3::uuid,
        reviewer_notes = $4::text,
        reviewed_at = now(),
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
      `,
            [
                requestId,
                input.decision,
                input.actorUserId,
                input.notes?.trim() || null
            ]
        );

        const record = this.mapRow(result.rows[0]);

        // Side effects are best-effort; verification status update above is the source of truth.
        if (input.decision === "approved") {
            await this.profilesService.setVerified(request.user_id, true).catch((error: unknown) => {
                this.logger.warn(
                    `Failed to update verified flag for user ${request.user_id} after verification ${requestId}: ${error instanceof Error ? error.message : String(error)}`
                );
            });
        }

        await this.auditService.logEvent({
            actorUserId: input.actorUserId,
            targetUserId: request.user_id,
            eventType: `verification_request_${input.decision}`,
            metadata: {
                verificationRequestId: requestId,
                reviewerNotes: input.notes || null
            }
        }).catch((error: unknown) => {
            this.logger.warn(
                `Failed to write audit event for verification ${requestId}: ${error instanceof Error ? error.message : String(error)}`
            );
        });

        // Notify the user about verification decision
        const notifType = input.decision === "approved"
            ? "verification_approved" as const
            : "verification_rejected" as const;
        const notifTitle = input.decision === "approved"
            ? "Verification approved!"
            : "Verification not approved";
        const notifBody = input.decision === "approved"
            ? "Your identity has been verified. You now have a verified badge."
            : "Your verification request was not approved. You can resubmit.";
        this.notificationService.create({
            userId: request.user_id,
            type: notifType,
            title: notifTitle,
            body: notifBody,
            data: { verificationRequestId: requestId, decision: input.decision }
        }).catch((error: unknown) => {
            this.logger.warn(
                `Failed to create notification for verification ${requestId}: ${error instanceof Error ? error.message : String(error)}`
            );
        });

        return record;
    }

    private mapRow(row: DbVerificationRow): VerificationRecord {
        return {
            id: row.id,
            userId: row.user_id,
            documentMediaIds: row.document_media_ids ?? [],
            documentType: row.document_type,
            notes: row.notes,
            status: row.status,
            reviewerUserId: row.reviewer_user_id,
            reviewerNotes: row.reviewer_notes,
            reviewedAt: row.reviewed_at?.toISOString() ?? null,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString()
        };
    }
}
