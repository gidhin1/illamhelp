import { afterEach, describe, expect, it, vi } from "vitest";

import { listVerifications, processModerationQueue, reviewVerification } from "./api";

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
});
