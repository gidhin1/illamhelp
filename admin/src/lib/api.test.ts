import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMemberTimeline,
  formatDate,
  listModerationQueue,
  listVerifications,
  processModerationQueue,
  reviewMedia,
  reviewVerification
} from "./api";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("admin API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes verification cursor filters using bearer authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], limit: 100, nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await listVerifications({ status: "pending", limit: 100, cursor: "next/id" }, "admin-token");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://localhost:4000/api/v1/admin/oversight/verifications?status=pending&limit=100&cursor=next%2Fid"
    );
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer admin-token");
  });

  it("serializes moderation and verification mutations", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ selected: 1, processed: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: "verification", status: "rejected" }));
    vi.stubGlobal("fetch", fetchMock);

    await processModerationQueue("token", 3);
    await reviewVerification("verification", { decision: "rejected", notes: "Mismatch" }, "token");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ limit: 3 })
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ decision: "rejected", notes: "Mismatch" })
    });
  });

  it("surfaces server-provided errors to operators", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Review already completed" }, 409)));

    await expect(
      reviewVerification("verification", { decision: "approved" }, "token")
    ).rejects.toThrow("Review already completed");
  });

  it("builds moderation filters and member timeline lookups", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ member: { userId: "member" }, accessRequests: [], consentGrants: [], auditEvents: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listModerationQueue("admin-token", { status: "pending", limit: 25 });
    await fetchMemberTimeline("  member/name  ", "admin-token", 50);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/admin/media/moderation-queue?status=pending&limit=25"
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/admin/oversight/timeline?memberId=member%2Fname&limit=50"
    );
  });

  it("serializes media review decisions and dispatches auth-expired events", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", class {
      readonly type: string;

      constructor(type: string) {
        this.type = type;
      }
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "media-1", state: "rejected" }))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    await reviewMedia("media-1", { decision: "rejected", reasonCode: "unsafe", notes: "Mismatch" }, "admin-token");
    await expect(listModerationQueue("expired")).rejects.toMatchObject({
      statusCode: 401,
      message: "Request failed with 401"
    });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/admin/media/media-1/review");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ decision: "rejected", reasonCode: "unsafe", notes: "Mismatch" })
    });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "illamhelp:auth-expired" }));
  });

  it("formats missing and invalid dates defensively", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
