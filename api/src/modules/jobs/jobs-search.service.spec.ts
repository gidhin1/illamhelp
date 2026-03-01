import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigService } from "@nestjs/config";

import { JobsSearchService } from "./jobs-search.service";

function mockConfigService(values: Record<string, string>): ConfigService {
  return {
    get<T>(key: string, fallback?: T): T {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key] as T;
      }
      return fallback as T;
    }
  } as ConfigService;
}

describe("JobsSearchService", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("indexes jobs and includes geo field when coordinates are provided", async () => {
    const service = new JobsSearchService(
      mockConfigService({
        OPENSEARCH_ENABLED: "true",
        OPENSEARCH_URL: "http://localhost:9200",
        OPENSEARCH_INDEX_JOBS: "jobs",
        OPENSEARCH_TIMEOUT_MS: "2000"
      })
    );

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ acknowledged: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "updated" }), { status: 200 }));

    await service.indexJob({
      id: "3c7618e8-e1a0-4fdd-b1b2-f8d7d7f65b65",
      seekerUserId: "1d1c285f-bfbe-4bc8-8f71-c26eb7db3fce",
      category: "plumber",
      title: "Kitchen sink fix",
      description: "Leakage in apartment kitchen sink.",
      locationText: "Kakkanad, Kochi",
      status: "posted",
      locationLatitude: 10.0159,
      locationLongitude: 76.3419,
      seekerRating: 4.5,
      createdAt: "2026-02-28T00:00:00.000Z"
    });

    const putDocCall = fetchMock.mock.calls[2];
    expect(putDocCall?.[0]).toContain("/jobs/_doc/3c7618e8-e1a0-4fdd-b1b2-f8d7d7f65b65");

    const requestInit = putDocCall?.[1];
    if (!requestInit || typeof requestInit.body !== "string") {
      throw new Error("Expected JSON body in OpenSearch index request");
    }
    const body = JSON.parse(requestInit.body) as Record<string, unknown>;
    expect(body.location_geo).toEqual({ lat: 10.0159, lon: 76.3419 });
    expect(body.seeker_rating).toBe(4.5);
  });

  it("builds geo/rating/status search filters and returns ordered IDs", async () => {
    const service = new JobsSearchService(
      mockConfigService({
        OPENSEARCH_ENABLED: "true",
        OPENSEARCH_URL: "http://localhost:9200",
        OPENSEARCH_INDEX_JOBS: "jobs",
        OPENSEARCH_TIMEOUT_MS: "2000"
      })
    );

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            took: 4,
            hits: {
              hits: [
                { _id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
                { _id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
              ]
            }
          }),
          { status: 200 }
        )
      );

    const result = await service.searchJobIds({
      q: "plumber",
      category: "plumber",
      locationText: "kochi",
      minSeekerRating: 4,
      statuses: ["posted"],
      latitude: 10.0159,
      longitude: 76.3419,
      radiusKm: 12,
      limit: 15
    });

    expect(result.available).toBe(true);
    expect(result.ids).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    ]);

    const searchCall = fetchMock.mock.calls[1];
    const init = searchCall?.[1];
    if (!init || typeof init.body !== "string") {
      throw new Error("Expected JSON body in OpenSearch search request");
    }
    const payload = JSON.parse(init.body) as Record<string, unknown>;
    expect(payload.size).toBe(15);

    const boolQuery = (payload.query as { bool?: { filter?: unknown[] } }).bool;
    expect(Array.isArray(boolQuery?.filter)).toBe(true);
    const filterJson = JSON.stringify(boolQuery?.filter ?? []);
    expect(filterJson).toContain("geo_distance");
    expect(filterJson).toContain("seeker_rating");
    expect(filterJson).toContain("posted");
  });

  it("returns unavailable result quickly when OpenSearch request times out", async () => {
    const service = new JobsSearchService(
      mockConfigService({
        OPENSEARCH_ENABLED: "true",
        OPENSEARCH_URL: "http://localhost:9200",
        OPENSEARCH_TIMEOUT_MS: "20"
      })
    );

    fetchMock.mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("Missing abort signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const startedAt = Date.now();
    const result = await service.searchJobIds({
      q: "electrician"
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.available).toBe(false);
    expect(result.ids).toEqual([]);
    expect(elapsedMs).toBeLessThan(500);
  });
});
