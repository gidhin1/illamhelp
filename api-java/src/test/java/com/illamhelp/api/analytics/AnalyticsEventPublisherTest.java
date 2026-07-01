package com.illamhelp.api.analytics;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AnalyticsEventPublisherTest {
  @Test
  void noOpsWhenMeasurementConfigurationIsMissing() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    AnalyticsEventPublisher publisher = new AnalyticsEventPublisher("", "", builder);

    publisher.publishProviderVerified("analytics-user", "request-1");

    server.verify();
  }

  @Test
  void publishesProviderVerifiedWithAllowlistedParametersOnly() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    AnalyticsEventPublisher publisher = new AnalyticsEventPublisher("G-TEST", "secret", builder);
    server.expect(requestTo(
            "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=secret"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(content().json("""
            {
              "client_id": "analytics-user",
              "events": [{
                "name": "provider_verified",
                "params": {
                  "surface": "server",
                  "schema_version": "v1",
                  "verification_request_id": "request-1"
                }
              }]
            }
            """))
        .andRespond(withSuccess());

    publisher.publishServerEvent("analytics-user", "provider_verified", Map.of(
        "surface", "server",
        "schema_version", "v1",
        "verification_request_id", "request-1",
        "email", "private@example.com"));

    server.verify();
  }
}
