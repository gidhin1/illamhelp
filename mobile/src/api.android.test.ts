import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { listJobsPage, listPublicApprovedMediaPage } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("routes Android API and media requests to the emulator host", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(
    JSON.stringify({ items: [], limit: 50, nextCursor: null }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  ));
  vi.stubGlobal("fetch", fetchMock);

  await listJobsPage("token");
  await listPublicApprovedMediaPage("member", "token");

  expect(fetchMock.mock.calls[0][0]).toBe("http://10.0.2.2:4000/api/v1/jobs");
  expect(fetchMock.mock.calls[1][0]).toBe("http://10.0.2.2:9091/media.v1.MediaService/ListProfileMedia");
});
