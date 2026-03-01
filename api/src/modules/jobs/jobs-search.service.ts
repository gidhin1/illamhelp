import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { JobStatus, SearchJobsInput } from "./jobs.service";

interface OpenSearchHit {
  _id: string;
}

interface OpenSearchSearchResponse {
  took?: number;
  hits?: {
    hits?: OpenSearchHit[];
  };
}

interface JobSearchDocument {
  id: string;
  seeker_user_id: string;
  category: string;
  category_normalized: string;
  title: string;
  description: string;
  location_text: string;
  location_normalized: string;
  status: JobStatus;
  seeker_rating: number | null;
  location_geo?: {
    lat: number;
    lon: number;
  };
  created_at: string;
}

export interface SearchJobIdsResult {
  available: boolean;
  ids: string[];
}

export interface SearchIndexedJobInput {
  id: string;
  seekerUserId: string;
  category: string;
  title: string;
  description: string;
  locationText: string;
  status: JobStatus;
  locationLatitude: number | null;
  locationLongitude: number | null;
  seekerRating: number | null;
  createdAt: string;
}

@Injectable()
export class JobsSearchService {
  private readonly logger = new Logger(JobsSearchService.name);
  private readonly enabled: boolean;
  private readonly openSearchUrl: string;
  private readonly jobsIndexName: string;
  private readonly requestTimeoutMs: number;
  private ensureIndexPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<string>("OPENSEARCH_ENABLED", "true") !== "false";
    this.openSearchUrl = (
      this.configService.get<string>("OPENSEARCH_URL", "http://localhost:9200") ??
      "http://localhost:9200"
    ).replace(/\/$/, "");
    this.jobsIndexName = this.configService.get<string>("OPENSEARCH_INDEX_JOBS", "jobs") ?? "jobs";
    this.requestTimeoutMs = this.parsePositiveInt(
      this.configService.get<string>("OPENSEARCH_TIMEOUT_MS", "750"),
      750
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async indexJob(input: SearchIndexedJobInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.ensureIndexExists();

    const document: JobSearchDocument = {
      id: input.id,
      seeker_user_id: input.seekerUserId,
      category: input.category,
      category_normalized: input.category.trim().toLowerCase(),
      title: input.title,
      description: input.description,
      location_text: input.locationText,
      location_normalized: input.locationText.trim().toLowerCase(),
      status: input.status,
      seeker_rating: input.seekerRating,
      created_at: input.createdAt
    };

    if (input.locationLatitude !== null && input.locationLongitude !== null) {
      document.location_geo = {
        lat: input.locationLatitude,
        lon: input.locationLongitude
      };
    }

    const response = await this.fetchWithTimeout(
      `${this.openSearchUrl}/${this.jobsIndexName}/_doc/${encodeURIComponent(input.id)}?refresh=false`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(document)
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenSearch index update failed (${response.status}): ${body.slice(0, 400)}`
      );
    }
  }

  async searchJobIds(input: SearchJobsInput): Promise<SearchJobIdsResult> {
    if (!this.enabled) {
      return { available: false, ids: [] };
    }

    try {
      await this.ensureIndexExists();
      const response = await this.fetchWithTimeout(
        `${this.openSearchUrl}/${this.jobsIndexName}/_search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(this.buildSearchPayload(input))
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OpenSearch search failed (${response.status}): ${body.slice(0, 400)}`
        );
      }

      const payload = (await response.json()) as OpenSearchSearchResponse;
      const ids =
        payload.hits?.hits
          ?.map((hit) => hit._id)
          .filter((id): id is string => typeof id === "string" && id.length > 0) ?? [];
      return {
        available: true,
        ids
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown OpenSearch failure";
      this.logger.warn(`OpenSearch job search unavailable; falling back to database: ${message}`);
      return {
        available: false,
        ids: []
      };
    }
  }

  private async ensureIndexExists(): Promise<void> {
    if (this.ensureIndexPromise) {
      return this.ensureIndexPromise;
    }

    this.ensureIndexPromise = (async () => {
      const headResponse = await this.fetchWithTimeout(
        `${this.openSearchUrl}/${this.jobsIndexName}`,
        {
          method: "HEAD"
        }
      );

      if (headResponse.ok) {
        return;
      }

      if (headResponse.status !== 404) {
        const body = await headResponse.text();
        throw new Error(
          `OpenSearch HEAD index failed (${headResponse.status}): ${body.slice(0, 300)}`
        );
      }

      const createResponse = await this.fetchWithTimeout(
        `${this.openSearchUrl}/${this.jobsIndexName}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            settings: {
              index: {
                number_of_shards: 1,
                number_of_replicas: 0
              }
            },
            mappings: {
              properties: {
                id: { type: "keyword" },
                seeker_user_id: { type: "keyword" },
                category: {
                  type: "text",
                  fields: {
                    keyword: { type: "keyword" }
                  }
                },
                category_normalized: { type: "keyword" },
                title: { type: "text" },
                description: { type: "text" },
                location_text: { type: "text" },
                location_normalized: { type: "keyword" },
                status: { type: "keyword" },
                seeker_rating: { type: "float" },
                location_geo: { type: "geo_point" },
                created_at: { type: "date" }
              }
            }
          })
        }
      );

      if (!createResponse.ok && createResponse.status !== 400) {
        const body = await createResponse.text();
        throw new Error(
          `OpenSearch index creation failed (${createResponse.status}): ${body.slice(0, 300)}`
        );
      }
    })();

    try {
      await this.ensureIndexPromise;
    } catch (error) {
      this.ensureIndexPromise = null;
      throw error;
    }
  }

  private buildSearchPayload(input: SearchJobsInput): Record<string, unknown> {
    const filterClauses: Record<string, unknown>[] = [];
    const normalizedCategory = input.category?.trim().toLowerCase();
    const normalizedLocation = input.locationText?.trim().toLowerCase();

    if (normalizedCategory) {
      filterClauses.push({
        term: {
          category_normalized: normalizedCategory
        }
      });
    }

    if (input.statuses && input.statuses.length > 0) {
      filterClauses.push({
        terms: {
          status: input.statuses
        }
      });
    }

    if (typeof input.minSeekerRating === "number") {
      filterClauses.push({
        range: {
          seeker_rating: {
            gte: input.minSeekerRating
          }
        }
      });
    }

    if (
      typeof input.latitude === "number" &&
      typeof input.longitude === "number" &&
      typeof input.radiusKm === "number"
    ) {
      filterClauses.push({
        geo_distance: {
          distance: `${input.radiusKm}km`,
          location_geo: {
            lat: input.latitude,
            lon: input.longitude
          }
        }
      });
    }

    const mustClauses: Record<string, unknown>[] = [];
    if (input.q) {
      mustClauses.push({
        multi_match: {
          query: input.q,
          fields: ["title^4", "description^2", "category^3", "location_text^2"],
          operator: "and"
        }
      });
    }

    if (normalizedLocation) {
      mustClauses.push({
        bool: {
          should: [
            {
              match_phrase_prefix: {
                location_text: normalizedLocation
              }
            },
            {
              term: {
                location_normalized: normalizedLocation
              }
            }
          ],
          minimum_should_match: 1
        }
      });
    }

    return {
      size: input.limit,
      _source: false,
      query:
        mustClauses.length === 0 && filterClauses.length === 0
          ? { match_all: {} }
          : {
              bool: {
                must: mustClauses,
                filter: filterClauses
              }
            },
      sort: [{ created_at: { order: "desc" as const } }]
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }
}
