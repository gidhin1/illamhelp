package com.illamhelp.api.analytics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AnalyticsEventPublisher {
  private static final Logger LOGGER = LoggerFactory.getLogger(AnalyticsEventPublisher.class);

  private final String measurementId;
  private final String apiSecret;
  private final RestClient restClient;

  public AnalyticsEventPublisher(
      @Value("${illamhelp.analytics.ga4-measurement-id:}") String measurementId,
      @Value("${illamhelp.analytics.ga4-api-secret:}") String apiSecret,
      RestClient.Builder builder) {
    this.measurementId = measurementId;
    this.apiSecret = apiSecret;
    this.restClient = builder.build();
  }

  public void publishProviderVerified(String analyticsUserId, String verificationRequestId) {
    publishServerEvent(
        analyticsUserId,
        "provider_verified",
        Map.of(
            "surface", "server",
            "schema_version", "v1",
            "verification_request_id", verificationRequestId));
  }

  public void publishServerEvent(String analyticsUserId, String eventName, Map<String, ?> params) {
    if (isBlank(measurementId) || isBlank(apiSecret) || isBlank(analyticsUserId) || isBlank(eventName)) {
      return;
    }
    Map<String, Object> sanitized = sanitizeParams(params);
    Map<String, Object> payload = Map.of(
        "client_id", analyticsUserId,
        "events", List.of(Map.of(
            "name", eventName,
            "params", sanitized)));
    try {
      restClient.post()
          .uri("https://www.google-analytics.com/mp/collect?measurement_id={measurementId}&api_secret={apiSecret}",
              measurementId, apiSecret)
          .body(payload)
          .retrieve()
          .toBodilessEntity();
    } catch (RuntimeException exception) {
      LOGGER.warn("Analytics event '{}' could not be published", eventName);
    }
  }

  private Map<String, Object> sanitizeParams(Map<String, ?> params) {
    Map<String, Object> sanitized = new LinkedHashMap<>();
    if (params == null) {
      return sanitized;
    }
    params.forEach((key, value) -> {
      if (isAllowedParam(key) && isAllowedValue(value)) {
        sanitized.put(key, value);
      }
    });
    return sanitized;
  }

  private boolean isAllowedParam(String key) {
    return List.of("surface", "schema_version", "verification_request_id").contains(key);
  }

  private boolean isAllowedValue(Object value) {
    return value instanceof String || value instanceof Number || value instanceof Boolean;
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }
}
