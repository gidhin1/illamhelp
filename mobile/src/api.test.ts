import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  listConsentRequests,
  listJobsPage,
  listNotifications,
  listPublicApprovedMediaPage
} from "./api";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("mobile API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the iOS local API and encodes cursor requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 50, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 50, nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await listJobsPage("token", "timestamp/id");
    await listPublicApprovedMediaPage("member/name", "next cursor");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/jobs?cursor=timestamp%2Fid");
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get("Authorization"))
      .toBe("Bearer token");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/media/public/member%2Fname?cursor=next%20cursor"
    );
  });

  it("normalizes cursor-page consent data for list screens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: "request-1" }],
      limit: 50,
      nextCursor: null
    })));

    await expect(listConsentRequests("token")).resolves.toEqual([{ id: "request-1" }]);
  });

  it("passes notification filters and exposes server errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 50, nextCursor: "more", unreadCount: 2 }))
      .mockResolvedValueOnce(jsonResponse({ message: "Authentication required" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listNotifications({ unreadOnly: true, limit: 50, cursor: "more" }, "token"))
      .resolves.toMatchObject({ unreadCount: 2, nextCursor: "more" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/notifications?unreadOnly=true&limit=50&cursor=more"
    );
    await expect(listJobsPage("expired")).rejects.toThrow("Authentication required");
  });
});
