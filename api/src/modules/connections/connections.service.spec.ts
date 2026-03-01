import type { QueryResult } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../common/database/database.service";
import type { ConsentService } from "../consent/consent.service";
import { ConnectionsService } from "./connections.service";

const REQUESTER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_TARGET_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_MEMBER_ID = "p_target12";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  } as QueryResult<T>;
}

describe("ConnectionsService query-based requests", () => {
  let queryMock: ReturnType<typeof vi.fn>;
  let service: ConnectionsService;

  beforeEach(() => {
    queryMock = vi.fn();
    const databaseServiceMock = {
      query: queryMock
    } as unknown as DatabaseService;
    const consentServiceMock = {
      revokeAllForConnection: vi.fn().mockResolvedValue(0)
    } as unknown as ConsentService;
    service = new ConnectionsService(databaseServiceMock, consentServiceMock);
  });

  it("creates a connection from targetQuery when exactly one member matches", async () => {
    queryMock
      // searchCandidates(targetQuery)
      .mockResolvedValueOnce(
        result([
          {
            user_id: TARGET_ID,
            first_name: "Anita",
            last_name: "K",
            city: "Kochi",
            area: "Kakkanad",
            service_categories: ["plumber"],
            job_categories: ["plumber"],
            job_locations: ["Kochi"],
            job_count: 2
          }
        ])
      )
      // assertUserExists(requesterUserId)
      .mockResolvedValueOnce(result([{ id: REQUESTER_ID }]))
      // assertUserExists(targetUserId)
      .mockResolvedValueOnce(result([{ id: TARGET_ID }]))
      // existing connection lookup
      .mockResolvedValueOnce(result([]))
      // insert connection
      .mockResolvedValueOnce(
        result([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "pending",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: null
          }
        ])
      );

    const created = await service.request({
      requesterUserId: REQUESTER_ID,
      targetQuery: "anita plumber kochi"
    });

    expect(created.userAId).toBe(REQUESTER_ID);
    expect(created.userBId).toBe(TARGET_ID);
    expect(created.status).toBe("pending");
    expect(queryMock).toHaveBeenCalledTimes(5);
  });

  it("accepts targetUserId provided as public member ID", async () => {
    queryMock
      // resolveInternalUserId(targetUserId=username)
      .mockResolvedValueOnce(result([{ id: TARGET_ID }]))
      // assertUserExists(requesterUserId)
      .mockResolvedValueOnce(result([{ id: REQUESTER_ID }]))
      // existing connection lookup
      .mockResolvedValueOnce(result([]))
      // insert connection
      .mockResolvedValueOnce(
        result([
          {
            id: "abababab-abab-4bab-8bab-abababababab",
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_MEMBER_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "pending",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: null
          }
        ])
      );

    const created = await service.request({
      requesterUserId: REQUESTER_ID,
      targetUserId: TARGET_MEMBER_ID
    });

    expect(created.userBId).toBe(TARGET_MEMBER_ID);
    expect(created.status).toBe("pending");
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("reopens a declined connection when the same pair requests again", async () => {
    const connectionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    queryMock
      // searchCandidates(targetQuery)
      .mockResolvedValueOnce(
        result([
          {
            user_id: TARGET_ID,
            first_name: "Anita",
            last_name: "K",
            city: "Kochi",
            area: "Kakkanad",
            service_categories: ["plumber"],
            job_categories: ["plumber"],
            job_locations: ["Kochi"],
            job_count: 2
          }
        ])
      )
      // assertUserExists(targetUserId)
      .mockResolvedValueOnce(result([{ id: TARGET_ID }]))
      // assertUserExists(requesterUserId)
      .mockResolvedValueOnce(result([{ id: REQUESTER_ID }]))
      // existing connection lookup
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: TARGET_ID,
            status: "declined",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: new Date("2026-02-21T10:05:00.000Z")
          }
        ])
      )
      // reopen declined -> pending
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "pending",
            requested_at: new Date("2026-02-21T10:06:00.000Z"),
            decided_at: null
          }
        ])
      );

    const reopened = await service.request({
      requesterUserId: REQUESTER_ID,
      targetQuery: "anita plumber kochi"
    });

    expect(reopened.id).toBe(connectionId);
    expect(reopened.status).toBe("pending");
    expect(reopened.requestedByUserId).toBe(REQUESTER_ID);
    expect(queryMock).toHaveBeenCalledTimes(5);
  });

  it("returns a disambiguation error when targetQuery matches multiple members", async () => {
    queryMock.mockResolvedValueOnce(
      result([
        {
          user_id: TARGET_ID,
          first_name: "Anita",
          last_name: "K",
          city: "Kochi",
          area: "Kakkanad",
          service_categories: ["plumber"],
          job_categories: ["plumber"],
          job_locations: ["Kochi"],
          job_count: 2
        },
        {
          user_id: SECOND_TARGET_ID,
          first_name: "Anita",
          last_name: "R",
          city: "Kochi",
          area: "Vyttila",
          service_categories: ["plumber"],
          job_categories: ["plumber"],
          job_locations: ["Kochi"],
          job_count: 1
        }
      ])
    );

    await expect(
      service.request({
        requesterUserId: REQUESTER_ID,
        targetQuery: "anita plumber"
      })
    ).rejects.toThrow("Multiple members matched");
  });

  it("declines a pending connection for a participant", async () => {
    const connectionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    queryMock
      // load connection
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "pending",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: null
          }
        ])
      )
      // update decline
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "declined",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: new Date("2026-02-21T10:05:00.000Z")
          }
        ])
      );

    const declined = await service.decline(connectionId, TARGET_ID);
    expect(declined.status).toBe("declined");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("does not accept connections that are not pending", async () => {
    const connectionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    queryMock.mockResolvedValueOnce(
      result([
        {
          id: connectionId,
          user_a_id: REQUESTER_ID,
          user_b_id: TARGET_ID,
          requested_by_user_id: REQUESTER_ID,
          status: "declined",
          requested_at: new Date("2026-02-21T10:00:00.000Z"),
          decided_at: new Date("2026-02-21T10:05:00.000Z")
        }
      ])
    );

    await expect(service.accept(connectionId, TARGET_ID)).rejects.toThrow(
      "Only pending connections can be accepted"
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("blocks an accepted connection for a participant", async () => {
    const connectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    queryMock
      // load connection
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "accepted",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: new Date("2026-02-21T10:02:00.000Z")
          }
        ])
      )
      // update block
      .mockResolvedValueOnce(
        result([
          {
            id: connectionId,
            user_a_id: REQUESTER_ID,
            user_b_id: TARGET_ID,
            requested_by_user_id: REQUESTER_ID,
            status: "blocked",
            requested_at: new Date("2026-02-21T10:00:00.000Z"),
            decided_at: new Date("2026-02-21T10:06:00.000Z")
          }
        ])
      );

    const blocked = await service.block(connectionId, REQUESTER_ID);
    expect(blocked.status).toBe("blocked");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("rejects self-acceptance of own connection request (BUG-004 regression)", async () => {
    const connectionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    queryMock.mockResolvedValueOnce(
      result([
        {
          id: connectionId,
          user_a_id: REQUESTER_ID,
          user_b_id: TARGET_ID,
          requested_by_user_id: REQUESTER_ID,
          status: "pending",
          requested_at: new Date("2026-02-21T10:00:00.000Z"),
          decided_at: null
        }
      ])
    );

    await expect(service.accept(connectionId, REQUESTER_ID)).rejects.toThrow(
      "Cannot accept your own connection request"
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
