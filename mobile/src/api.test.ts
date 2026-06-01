import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  canViewConsent,
  completeMediaUpload,
  createMediaUploadTicket,
  formatDate,
  getProfileByUserId,
  listConnections,
  listConnectionsPage,
  listConsentRequests,
  listJobsPage,
  listNotifications,
  listPublicApprovedMediaPage,
  requestConsentAccess,
  searchConnections,
  updateMyProfile
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

  it("normalizes connection lists and encodes page cursors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "connection-1" }]))
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 50, nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listConnections("token")).resolves.toEqual([{ id: "connection-1" }]);
    await listConnectionsPage("token", "cursor/with space");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/connections");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/connections?cursor=cursor%2Fwith%20space"
    );
  });

  it("builds profile and connection search requests from customer input", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ userId: "member/name" }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ userId: "me" }));
    vi.stubGlobal("fetch", fetchMock);

    await getProfileByUserId("member/name", "token");
    await searchConnections({ q: "  plumber near me  ", limit: 10 }, "token");
    await updateMyProfile({ city: "Kochi", serviceCategories: ["plumber"] }, "token");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/profiles/member%2Fname");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/connections/search?q=plumber+near+me&limit=10"
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ city: "Kochi", serviceCategories: ["plumber"] })
    });
  });

  it("serializes consent and media mutations with bearer auth", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ allowed: true }))
      .mockResolvedValueOnce(jsonResponse({ id: "request-1" }))
      .mockResolvedValueOnce(jsonResponse({ mediaId: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1", state: "approved" }));
    vi.stubGlobal("fetch", fetchMock);

    await canViewConsent({ ownerUserId: "owner", field: "phone" }, "token");
    await requestConsentAccess({
      ownerUserId: "owner",
      connectionId: "connection",
      requestedFields: ["phone"],
      purpose: "Coordinate the job"
    }, "token");
    await createMediaUploadTicket({
      kind: "image",
      contentType: "image/jpeg",
      fileSizeBytes: 123,
      checksumSha256: "abc",
      originalFileName: "proof.jpg"
    }, "token");
    await completeMediaUpload("media/1", { etag: "etag" }, "token");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ ownerUserId: "owner", field: "phone" })
    });
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/consent/request-access");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3][0]).toBe("http://localhost:4000/api/v1/media/media/1/complete");
    expect(new Headers((fetchMock.mock.calls[3][1] as RequestInit).headers).get("Authorization"))
      .toBe("Bearer token");
  });

  it("adds request context to network failures and formats dates defensively", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));

    await expect(listJobsPage("token")).rejects.toThrow("Network down (/jobs)");
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
