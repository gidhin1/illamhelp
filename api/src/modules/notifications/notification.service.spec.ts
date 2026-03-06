import type { QueryResult } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import { NotificationService } from "./notification.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTIF_ID_1 = "22222222-2222-4222-8222-222222222222";
const NOTIF_ID_2 = "33333333-3333-4333-8333-333333333333";

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

function notifRow(overrides: Record<string, unknown> = {}) {
    return {
        id: NOTIF_ID_1,
        user_id: USER_ID,
        type: "job_application_received",
        title: "New application received",
        body: "You have a new application for your plumbing job",
        data: { jobId: "abc-123" },
        read: false,
        read_at: null,
        created_at: new Date("2026-03-06T10:00:00Z"),
        ...overrides
    };
}

describe("NotificationService", () => {
    let queryMock: ReturnType<typeof vi.fn>;
    let service: NotificationService;

    beforeEach(() => {
        queryMock = vi.fn();
        service = new NotificationService(
            { query: queryMock } as unknown as DatabaseService
        );
    });

    describe("create", () => {
        it("inserts a notification and returns the mapped record", async () => {
            queryMock.mockResolvedValueOnce(queryResult([notifRow()]));

            const result = await service.create({
                userId: USER_ID,
                type: "job_application_received",
                title: "New application received",
                body: "You have a new application for your plumbing job",
                data: { jobId: "abc-123" }
            });

            expect(result.id).toBe(NOTIF_ID_1);
            expect(result.userId).toBe(USER_ID);
            expect(result.type).toBe("job_application_received");
            expect(result.title).toBe("New application received");
            expect(result.read).toBe(false);
            expect(result.data).toEqual({ jobId: "abc-123" });
        });
    });

    describe("createBatch", () => {
        it("inserts multiple notifications and returns count", async () => {
            queryMock.mockResolvedValueOnce(queryResult([]));

            const count = await service.createBatch([
                {
                    userId: USER_ID,
                    type: "job_application_received",
                    title: "App 1",
                    body: "Body 1"
                },
                {
                    userId: USER_ID,
                    type: "job_booking_started",
                    title: "Booking started",
                    body: "Body 2"
                }
            ]);

            expect(queryMock).toHaveBeenCalledTimes(1);
            const sql = queryMock.mock.calls[0][0] as string;
            expect(sql).toContain("INSERT INTO notifications");
        });

        it("returns 0 for empty array", async () => {
            const count = await service.createBatch([]);
            expect(count).toBe(0);
            expect(queryMock).not.toHaveBeenCalled();
        });
    });

    describe("list", () => {
        it("returns paginated notifications with unread count", async () => {
            queryMock
                // COUNT total
                .mockResolvedValueOnce(queryResult([{ count: "5" }]))
                // COUNT unread
                .mockResolvedValueOnce(queryResult([{ count: "3" }]))
                // SELECT data
                .mockResolvedValueOnce(queryResult([notifRow(), notifRow({ id: NOTIF_ID_2, read: true, read_at: new Date() })]));

            const result = await service.list({
                userId: USER_ID,
                limit: 10,
                offset: 0
            });

            expect(result.total).toBe(5);
            expect(result.unreadCount).toBe(3);
            expect(result.items).toHaveLength(2);
            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);
        });

        it("respects unreadOnly filter", async () => {
            queryMock
                .mockResolvedValueOnce(queryResult([{ count: "3" }]))
                .mockResolvedValueOnce(queryResult([{ count: "3" }]))
                .mockResolvedValueOnce(queryResult([notifRow()]));

            const result = await service.list({
                userId: USER_ID,
                unreadOnly: true
            });

            const countSql = queryMock.mock.calls[0][0] as string;
            expect(countSql).toContain("read = false");
        });
    });

    describe("getUnreadCount", () => {
        it("returns the count of unread notifications", async () => {
            queryMock.mockResolvedValueOnce(queryResult([{ count: "7" }]));

            const result = await service.getUnreadCount(USER_ID);

            expect(result.unreadCount).toBe(7);
        });
    });

    describe("markRead", () => {
        it("marks a notification as read and returns it", async () => {
            queryMock.mockResolvedValueOnce(
                queryResult([notifRow({ read: true, read_at: new Date() })])
            );

            const result = await service.markRead(NOTIF_ID_1, USER_ID);

            expect(result.read).toBe(true);
            expect(result.readAt).not.toBeNull();
        });

        it("throws if notification not found", async () => {
            queryMock.mockResolvedValueOnce(queryResult([]));

            await expect(service.markRead(NOTIF_ID_1, USER_ID)).rejects.toThrow(
                "Notification not found"
            );
        });
    });

    describe("markAllRead", () => {
        it("marks all unread notifications as read", async () => {
            queryMock.mockResolvedValueOnce({ ...queryResult([]), rowCount: 5 });

            const result = await service.markAllRead(USER_ID);

            expect(result.updated).toBe(5);
            const sql = queryMock.mock.calls[0][0] as string;
            expect(sql).toContain("UPDATE notifications");
            expect(sql).toContain("read = false");
        });
    });
});
