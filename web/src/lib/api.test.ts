import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  listConsentRequests,
  listJobs,
  listNotifications,
  login
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
});
