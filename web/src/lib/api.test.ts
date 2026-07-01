import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  canViewConsent,
  completeMediaUpload,
  createMediaUploadTicket,
  formatDate,
  getProfileByUserId,
  listConnections,
  listConsentRequests,
  listConsentRequestsPage,
  listVerifications,
  listJobs,
  listNotifications,
  login,
  markAllNotificationsRead,
  register,
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

describe("web API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends bearer authentication and keyset pagination for jobs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [],
      limit: 25,
      nextCursor: null
    }));
    vi.stubGlobal("fetch", fetchMock);

    await listJobs("access-token", { limit: 25, cursor: "time/id" });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/api/v1/jobs?limit=25&cursor=time%2Fid");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("constructs notification filters and cursor requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [],
      limit: 50,
      nextCursor: null,
      unreadCount: 3
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listNotifications({ unreadOnly: true, limit: 50, cursor: "next page" }, "token");

    expect(result.unreadCount).toBe(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/notifications?unreadOnly=true&limit=50&cursor=next+page"
    );
  });

  it("normalizes cursor-page consent payloads for legacy list callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: "request-1" }],
      limit: 50,
      nextCursor: "next"
    })));

    await expect(listConsentRequests("token")).resolves.toEqual([{ id: "request-1" }]);
  });

  it("preserves API error status and validation messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      message: ["Username is required", "Password is required"]
    }, 400)));

    await expect(login({ username: "", password: "" })).rejects.toMatchObject({
      name: "ApiRequestError",
      statusCode: 400,
      message: "Username is required, Password is required"
    } satisfies Partial<ApiRequestError>);
  });

  it("serializes policy acceptance during registration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "token" }));
    vi.stubGlobal("fetch", fetchMock);

    await register({
      username: "member",
      email: "member@example.com",
      password: "StrongPass#2026",
      firstName: "Member",
      acceptedTermsVersion: "2026-06-14",
      acceptedPrivacyPolicyVersion: "2026-06-14",
      acceptedLegalAt: "2026-06-14T12:00:00Z",
      acceptanceSource: "web"
    });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/auth/register");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        username: "member",
        email: "member@example.com",
        password: "StrongPass#2026",
        firstName: "Member",
        acceptedTermsVersion: "2026-06-14",
        acceptedPrivacyPolicyVersion: "2026-06-14",
        acceptedLegalAt: "2026-06-14T12:00:00Z",
        acceptanceSource: "web"
      })
    });
  });

  it("dispatches auth-expired events for unauthorized browser responses", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", class {
      readonly type: string;

      constructor(type: string) {
        this.type = type;
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    await expect(listConnections("expired")).rejects.toMatchObject({
      statusCode: 401,
      message: "Request failed with 401"
    });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "illamhelp:auth-expired" }));
  });

  it("encodes IDs and cursor parameters for profile and consent pages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ userId: "member/name" }))
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 50, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [], limit: 20, nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await getProfileByUserId("member/name", "token");
    await listConsentRequestsPage("token", "request/id");
    await listVerifications({ status: "pending", limit: 20, cursor: "verify/id" }, "admin-token");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/profiles/member%2Fname");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/consent/requests?cursor=request%2Fid"
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      "http://localhost:4000/api/v1/admin/oversight/verifications?status=pending&limit=20&cursor=verify%2Fid"
    );
  });

  it("builds search requests and profile patches from trimmed customer input", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ userId: "me" }))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchConnections({ q: "  cleaner near me  ", limit: 5 }, "token");
    await updateMyProfile({ city: "Kochi", serviceCategories: ["cleaner"] }, "token");
    await searchConnections({ q: "   " }, "token");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/connections/search?q=cleaner+near+me&limit=5"
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ city: "Kochi", serviceCategories: ["cleaner"] })
    });
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:4000/api/v1/connections/search");
  });

  it("serializes consent, media, and notification mutations", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ allowed: true }))
      .mockResolvedValueOnce(jsonResponse({ id: "request-1" }))
      .mockResolvedValueOnce(jsonResponse({ mediaId: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "media-1", state: "approved", purpose: "profile", kind: "image" }))
      .mockResolvedValueOnce(jsonResponse({ updated: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    await canViewConsent({ ownerUserId: "owner", field: "email" }, "token");
    await requestConsentAccess({
      ownerUserId: "owner",
      connectionId: "connection",
      requestedFields: ["email"],
      purpose: "Coordinate service"
    }, "token");
    await createMediaUploadTicket({
      kind: "image",
      contentType: "image/png",
      fileSizeBytes: 456,
      checksumSha256: "checksum",
      originalFileName: "proof.png",
      purpose: "profile"
    }, "token");
    await completeMediaUpload("media-1", { etag: "etag" }, "token");
    await markAllNotificationsRead("token");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ ownerUserId: "owner", field: "email" })
    });
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/consent/request-access");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3][0]).toBe("http://localhost:9091/media.v1.MediaService/CompleteUpload");
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: "PATCH" });
  });

  it("does not push analytics events without web analytics configuration", async () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => JSON.stringify({ analytics: "granted", ads: "denied", updatedAt: "2026-07-01T00:00:00Z" }),
        setItem: vi.fn()
      },
      dataLayer
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      id: "media-1",
      state: "approved",
      purpose: "job",
      kind: "video"
    })));

    await completeMediaUpload("media-1", { etag: "etag" }, "token");

    expect(dataLayer).toEqual([]);
  });

  it("formats missing and invalid dates defensively", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
