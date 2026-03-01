import type { QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import { AuthUserService } from "./auth-user.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function queryResult<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
    return {
        command: "SELECT",
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows
    } as QueryResult<T>;
}

describe("AuthUserService getUsernameByUserId", () => {
    it("returns username when user exists", async () => {
        const queryMock = vi.fn().mockResolvedValueOnce(
            queryResult([{ username: "anita.k" }])
        );
        const service = new AuthUserService({
            query: queryMock
        } as unknown as DatabaseService);

        const username = await service.getUsernameByUserId(USER_ID);
        expect(username).toBe("anita.k");
        expect(queryMock).toHaveBeenCalledTimes(1);
        const sql = queryMock.mock.calls[0][0] as string;
        expect(sql).toContain("SELECT username FROM users");
    });

    it("returns null for unknown user", async () => {
        const queryMock = vi.fn().mockResolvedValueOnce(
            queryResult([])
        );
        const service = new AuthUserService({
            query: queryMock
        } as unknown as DatabaseService);

        const username = await service.getUsernameByUserId(USER_ID);
        expect(username).toBeNull();
    });

    it("throws for invalid UUID", async () => {
        const queryMock = vi.fn();
        const service = new AuthUserService({
            query: queryMock
        } as unknown as DatabaseService);

        await expect(service.getUsernameByUserId("not-a-uuid")).rejects.toThrow();
        expect(queryMock).not.toHaveBeenCalled();
    });
});
