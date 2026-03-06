import type { ConfigService } from "@nestjs/config";
import type { QueryResult } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { AuditService } from "../audit/audit.service";
import type { ProfilesService } from "./profiles.service";
import { VerificationService } from "./verification.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const MEDIA_ID_1 = "44444444-4444-4444-8444-444444444444";
const MEDIA_ID_2 = "55555555-5555-4555-8555-555555555555";

function queryResult<T extends Record<string, unknown>>(
    rows: T[]
): QueryResult<T> {
    return {
        command: "SELECT",
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows
    } as QueryResult<T>;
}

function verificationRow(overrides: Record<string, unknown> = {}) {
    return {
        id: REQUEST_ID,
        user_id: USER_ID,
        document_media_ids: [MEDIA_ID_1],
        document_type: "government_id",
        notes: "My Aadhaar card",
        status: "pending",
        reviewer_user_id: null,
        reviewer_notes: null,
        reviewed_at: null,
        created_at: new Date("2026-03-05T10:00:00Z"),
        updated_at: new Date("2026-03-05T10:00:00Z"),
        ...overrides
    };
}

describe("VerificationService", () => {
    let queryMock: ReturnType<typeof vi.fn>;
    let logEventMock: ReturnType<typeof vi.fn>;
    let setVerifiedMock: ReturnType<typeof vi.fn>;
    let service: VerificationService;

    beforeEach(() => {
        queryMock = vi.fn();
        logEventMock = vi.fn().mockResolvedValue(undefined);
        setVerifiedMock = vi.fn().mockResolvedValue(undefined);

        service = new VerificationService(
            { query: queryMock } as unknown as DatabaseService,
            { logEvent: logEventMock } as unknown as AuditService,
            { setVerified: setVerifiedMock } as unknown as ProfilesService,
            {
                create: vi.fn().mockResolvedValue({ id: "mock-notification" })
            } as any
        );
    });

    describe("submit", () => {
        it("creates a verification request and returns the record", async () => {
            // Check for existing active request → none
            queryMock.mockResolvedValueOnce(queryResult([]));
            // INSERT → new row
            queryMock.mockResolvedValueOnce(queryResult([verificationRow()]));

            const result = await service.submit({
                actorUserId: USER_ID,
                documentType: "government_id",
                documentMediaIds: [MEDIA_ID_1],
                notes: "My Aadhaar card"
            });

            expect(result.id).toBe(REQUEST_ID);
            expect(result.userId).toBe(USER_ID);
            expect(result.documentType).toBe("government_id");
            expect(result.status).toBe("pending");
            expect(result.documentMediaIds).toEqual([MEDIA_ID_1]);
            expect(logEventMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: "verification_request_submitted",
                    actorUserId: USER_ID
                })
            );
        });

        it("rejects if user already has an active request", async () => {
            queryMock.mockResolvedValueOnce(queryResult([{ id: REQUEST_ID }]));

            await expect(
                service.submit({
                    actorUserId: USER_ID,
                    documentType: "government_id",
                    documentMediaIds: [MEDIA_ID_1]
                })
            ).rejects.toThrow("already have a pending verification request");
        });

        it("rejects if no document media IDs provided", async () => {
            await expect(
                service.submit({
                    actorUserId: USER_ID,
                    documentType: "government_id",
                    documentMediaIds: []
                })
            ).rejects.toThrow("At least one document media ID is required");
        });
    });

    describe("getMyVerification", () => {
        it("returns the most recent verification request", async () => {
            queryMock.mockResolvedValueOnce(queryResult([verificationRow()]));

            const result = await service.getMyVerification(USER_ID);

            expect(result).not.toBeNull();
            expect(result!.id).toBe(REQUEST_ID);
            expect(result!.status).toBe("pending");
        });

        it("returns null when no verification exists", async () => {
            queryMock.mockResolvedValueOnce(queryResult([]));

            const result = await service.getMyVerification(USER_ID);

            expect(result).toBeNull();
        });
    });

    describe("review", () => {
        it("approves a pending request and sets user as verified", async () => {
            // Fetch existing request
            queryMock.mockResolvedValueOnce(queryResult([verificationRow()]));
            // UPDATE → approved
            queryMock.mockResolvedValueOnce(
                queryResult([
                    verificationRow({
                        status: "approved",
                        reviewer_user_id: ADMIN_USER_ID,
                        reviewer_notes: "Documents verified",
                        reviewed_at: new Date()
                    })
                ])
            );

            const result = await service.review(REQUEST_ID, {
                actorUserId: ADMIN_USER_ID,
                decision: "approved",
                notes: "Documents verified"
            });

            expect(result.status).toBe("approved");
            expect(result.reviewerUserId).toBe(ADMIN_USER_ID);
            expect(setVerifiedMock).toHaveBeenCalledWith(USER_ID, true);
            expect(logEventMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: "verification_request_approved",
                    actorUserId: ADMIN_USER_ID,
                    targetUserId: USER_ID
                })
            );
        });

        it("rejects a pending request without updating verified flag", async () => {
            queryMock.mockResolvedValueOnce(queryResult([verificationRow()]));
            queryMock.mockResolvedValueOnce(
                queryResult([
                    verificationRow({
                        status: "rejected",
                        reviewer_user_id: ADMIN_USER_ID,
                        reviewer_notes: "Poor image quality",
                        reviewed_at: new Date()
                    })
                ])
            );

            const result = await service.review(REQUEST_ID, {
                actorUserId: ADMIN_USER_ID,
                decision: "rejected",
                notes: "Poor image quality"
            });

            expect(result.status).toBe("rejected");
            expect(setVerifiedMock).not.toHaveBeenCalled();
            expect(logEventMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: "verification_request_rejected"
                })
            );
        });

        it("throws if request is already reviewed", async () => {
            queryMock.mockResolvedValueOnce(
                queryResult([verificationRow({ status: "approved" })])
            );

            await expect(
                service.review(REQUEST_ID, {
                    actorUserId: ADMIN_USER_ID,
                    decision: "approved"
                })
            ).rejects.toThrow("Cannot review a verification request in 'approved' status");
        });

        it("throws if request not found", async () => {
            queryMock.mockResolvedValueOnce(queryResult([]));

            await expect(
                service.review(REQUEST_ID, {
                    actorUserId: ADMIN_USER_ID,
                    decision: "approved"
                })
            ).rejects.toThrow("Verification request not found");
        });
    });

    describe("listForAdmin", () => {
        it("returns paginated results with total count", async () => {
            queryMock
                .mockResolvedValueOnce(queryResult([{ count: "3" }]))
                .mockResolvedValueOnce(queryResult([verificationRow()]));

            const result = await service.listForAdmin({
                status: "pending",
                limit: 10,
                offset: 0
            });

            expect(result.total).toBe(3);
            expect(result.items).toHaveLength(1);
            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);
        });
    });
});
