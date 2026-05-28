package com.illamhelp.api.jobs;

import com.illamhelp.api.config.AppProperties;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class JobsSearchService {
  private static final Logger LOGGER = LoggerFactory.getLogger(JobsSearchService.class);
  private final AppProperties properties;
  private final RestClient restClient;
  private volatile boolean indexReady;
  private volatile long indexRetryAfterMs;

  public JobsSearchService(AppProperties properties, RestClient.Builder builder) {
    this.properties = properties;
    this.restClient = builder.build();
  }

  public SearchResult searchJobIds(SearchCriteria criteria) {
    if (!properties.openSearchEnabled()) {
      return new SearchResult(false, List.of());
    }
    try {
      ensureIndex();
      Map<?, ?> payload = restClient.post()
          .uri(endpoint("_search"))
          .headers(this::authorize)
          .body(buildSearchPayload(criteria))
          .retrieve()
          .body(Map.class);
      return new SearchResult(true, extractIds(payload));
    } catch (RuntimeException exception) {
      LOGGER.warn("OpenSearch job search unavailable; using PostgreSQL fallback: {}", exception.getMessage());
      return new SearchResult(false, List.of());
    }
  }

  public void indexJob(Map<String, Object> job) {
    if (!properties.openSearchEnabled() || job == null || job.get("id") == null
        || System.currentTimeMillis() < indexRetryAfterMs) {
      return;
    }
    try {
      ensureIndex();
      restClient.put()
                .uri(endpoint("_doc/" + job.get("id") + "?refresh=wait_for"))
          .headers(this::authorize)
          .body(indexDocument(job))
          .retrieve()
          .toBodilessEntity();
    } catch (RuntimeException exception) {
      indexRetryAfterMs = System.currentTimeMillis() + 120_000;
      LOGGER.warn("OpenSearch job index update failed for {}; PostgreSQL remains authoritative: {}",
          job.get("id"), exception.getMessage());
    }
  }

  Map<String, Object> buildSearchPayload(SearchCriteria criteria) {
    List<Map<String, Object>> filters = new ArrayList<>();
    if (criteria.category() != null) {
      filters.add(Map.of("term", Map.of("category_normalized", criteria.category())));
    }
    if (!criteria.statuses().isEmpty()) {
      filters.add(Map.of("terms", Map.of("status", criteria.statuses())));
    }
    if (criteria.minSeekerRating() != null) {
      filters.add(Map.of("range", Map.of("seeker_rating", Map.of("gte", criteria.minSeekerRating()))));
    }
    if (criteria.latitude() != null) {
      filters.add(Map.of("geo_distance", Map.of(
          "distance", criteria.radiusKm() + "km",
          "location_geo", Map.of("lat", criteria.latitude(), "lon", criteria.longitude()))));
    }
    List<Map<String, Object>> must = new ArrayList<>();
    if (criteria.query() != null) {
      must.add(Map.of("multi_match", Map.of(
          "query", criteria.query(),
          "fields", List.of("title^4", "description^2", "category^3", "location_text^2"),
          "operator", "and")));
    }
    if (criteria.locationText() != null) {
      must.add(Map.of("bool", Map.of("should", List.of(
          Map.of("match_phrase_prefix", Map.of("location_text", criteria.locationText())),
          Map.of("term", Map.of("location_normalized", criteria.locationText()))),
          "minimum_should_match", 1)));
    }
    Map<String, Object> bool = new LinkedHashMap<>();
    if (!must.isEmpty()) {
      bool.put("must", must);
    }
    if (!filters.isEmpty()) {
      bool.put("filter", filters);
    }
    Map<String, Object> query = bool.isEmpty() ? Map.of("match_all", Map.of()) : Map.of("bool", bool);
    return Map.of("size", criteria.limit(), "_source", false, "query", query,
        "sort", List.of(Map.of("created_at", Map.of("order", "desc"))));
  }

  Map<String, Object> indexDocument(Map<String, Object> job) {
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("id", job.get("id"));
    document.put("seeker_user_id", job.get("seekerUserId"));
    document.put("category", job.get("category"));
    document.put("category_normalized", lower(job.get("category")));
    document.put("title", job.get("title"));
    document.put("description", job.get("description"));
    document.put("location_text", job.get("locationText"));
    document.put("location_normalized", lower(job.get("locationText")));
    document.put("status", job.get("status"));
    document.put("seeker_rating", job.getOrDefault("seekerRating", 0));
    document.put("created_at", String.valueOf(job.get("createdAt")));
    if (job.get("locationLatitude") != null && job.get("locationLongitude") != null) {
      document.put("location_geo", Map.of("lat", job.get("locationLatitude"), "lon", job.get("locationLongitude")));
    }
    return document;
  }

  private void ensureIndex() {
    if (indexReady) {
      return;
    }
    synchronized (this) {
      if (indexReady) {
        return;
      }
      try {
        restClient.head().uri(endpoint("")).headers(this::authorize).retrieve().toBodilessEntity();
      } catch (RuntimeException missing) {
        restClient.put().uri(endpoint("")).headers(this::authorize).body(indexMapping()).retrieve().toBodilessEntity();
      }
      indexReady = true;
    }
  }

  private Map<String, Object> indexMapping() {
    return Map.of(
        "settings", Map.of("index", Map.of("number_of_shards", 1, "number_of_replicas", 0)),
        "mappings", Map.of("properties", Map.ofEntries(
            Map.entry("id", Map.of("type", "keyword")),
            Map.entry("seeker_user_id", Map.of("type", "keyword")),
            Map.entry("category", Map.of("type", "text")),
            Map.entry("category_normalized", Map.of("type", "keyword")),
            Map.entry("title", Map.of("type", "text")),
            Map.entry("description", Map.of("type", "text")),
            Map.entry("location_text", Map.of("type", "text")),
            Map.entry("location_normalized", Map.of("type", "keyword")),
            Map.entry("status", Map.of("type", "keyword")),
            Map.entry("seeker_rating", Map.of("type", "float")),
            Map.entry("location_geo", Map.of("type", "geo_point")),
            Map.entry("created_at", Map.of("type", "date")))));
  }

  private String endpoint(String suffix) {
    String base = properties.openSearchUrl().replaceAll("/+$", "");
    String index = properties.openSearchIndexJobs();
    return suffix.isBlank() ? base + "/" + index : base + "/" + index + "/" + suffix;
  }

  private void authorize(HttpHeaders headers) {
    if (properties.openSearchUsername() != null && !properties.openSearchUsername().isBlank()) {
      headers.setBasicAuth(properties.openSearchUsername(), properties.openSearchPassword());
    }
  }

  private String lower(Object value) {
    return value == null ? "" : String.valueOf(value).trim().toLowerCase();
  }

  @SuppressWarnings("unchecked")
  private List<String> extractIds(Map<?, ?> payload) {
    if (!((payload == null ? null : payload.get("hits")) instanceof Map<?, ?> hits)
        || !(hits.get("hits") instanceof List<?> results)) {
      return List.of();
    }
    return results.stream()
        .filter(Map.class::isInstance)
        .map(Map.class::cast)
        .map(hit -> hit.get("_id"))
        .filter(String.class::isInstance)
        .map(String.class::cast)
        .filter(id -> !id.isBlank())
        .toList();
  }

  public record SearchCriteria(String query, String category, String locationText, Double minSeekerRating,
      List<String> statuses, Double latitude, Double longitude, Double radiusKm, int limit) {
  }

  public record SearchResult(boolean available, List<String> ids) {
  }
}
