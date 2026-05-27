package com.illamhelp.api.jobs;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
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

  @Test
  void searchesExistingOpenSearchIndexAndReturnsOnlyUsableIds() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    JobsSearchService service = new JobsSearchService(properties(), builder);
    server.expect(requestTo("http://localhost:9200/jobs"))
        .andExpect(method(HttpMethod.HEAD))
        .andRespond(withSuccess());
    server.expect(requestTo("http://localhost:9200/jobs/_search"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess("""
            {"hits":{"hits":[{"_id":"job-1"},{"_id":""},{"source":"ignored"},{"_id":"job-2"}]}}
            """, MediaType.APPLICATION_JSON));

    JobsSearchService.SearchResult result = service.searchJobIds(new JobsSearchService.SearchCriteria(
        null, null, null, null, List.of(), null, null, null, 20));

    assertThat(result.available()).isTrue();
    assertThat(result.ids()).containsExactly("job-1", "job-2");
    server.verify();
  }

  @Test
  void createsMissingIndexThenIndexesDocumentIncludingLocationCoordinates() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    JobsSearchService service = new JobsSearchService(properties(), builder);
    server.expect(requestTo("http://localhost:9200/jobs"))
        .andExpect(method(HttpMethod.HEAD))
        .andRespond(withStatus(HttpStatus.NOT_FOUND));
    server.expect(requestTo("http://localhost:9200/jobs"))
        .andExpect(method(HttpMethod.PUT))
        .andRespond(withSuccess());
    server.expect(requestTo("http://localhost:9200/jobs/_doc/job-geo?refresh=wait_for"))
        .andExpect(method(HttpMethod.PUT))
        .andRespond(withSuccess());

    service.indexJob(Map.of(
        "id", "job-geo", "seekerUserId", "owner", "category", "Plumber", "title", "Repair sink",
        "description", "Leaking pipe", "locationText", " Doha ", "status", "posted",
        "createdAt", "2026-05-27T00:00:00Z", "locationLatitude", 25.28, "locationLongitude", 51.53));

    assertThat(service.indexDocument(Map.of(
        "id", "job-geo", "category", "PLUMBER", "locationText", " DOHA ", "createdAt", "now")))
        .containsEntry("category_normalized", "plumber")
        .containsEntry("location_normalized", "doha");
    server.verify();
  }
}
