package com.illamhelp.api.jobs;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class JobsSearchServiceTest {
  @Test
  void buildsOpenSearchPayloadWithTextRatingStatusAndGeoFilters() {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    JobsSearchService service = new JobsSearchService(properties(), builder);

    Map<String, Object> payload = service.buildSearchPayload(new JobsSearchService.SearchCriteria(
        "plumber", "plumber", "kochi", 4.0, List.of("posted"), 10.0159, 76.3419, 12.0, 15));

    assertThat(payload).containsEntry("size", 15);
    assertThat(String.valueOf(payload.get("query")))
        .contains("geo_distance", "seeker_rating", "posted", "plumber", "kochi");
  }

  @Test
  void indexesUnratedSeekersAsZeroToMatchDatabaseRatingFilterSemantics() {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    JobsSearchService service = new JobsSearchService(properties(), builder);

    Map<String, Object> document = service.indexDocument(Map.of(
        "id", "job-1", "category", "plumber", "title", "Repair", "description", "Sink",
        "locationText", "Kochi", "status", "posted", "createdAt", "2026-05-25T00:00:00Z"));

    assertThat(document.get("seeker_rating")).isEqualTo(0);
  }

  @Test
  void returnsDatabaseFallbackWhenOpenSearchRequestCannotComplete() {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    JobsSearchService service = new JobsSearchService(properties(), builder);

    JobsSearchService.SearchResult result = service.searchJobIds(new JobsSearchService.SearchCriteria(
        "care", null, null, null, List.of("posted"), null, null, null, 20));

    assertThat(result.available()).isFalse();
    assertThat(result.ids()).isEmpty();
  }
}
