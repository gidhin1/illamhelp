package com.illamhelp.api.consent;

import com.illamhelp.api.config.AppProperties;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class OpaService {
  private final AppProperties properties;
  private final RestClient restClient;

  public OpaService(AppProperties properties, RestClient.Builder builder) {
    this.properties = properties;
    this.restClient = builder.build();
  }

  public boolean canViewPii(Map<String, Object> input) {
    try {
      Map<?, ?> response = restClient.post()
          .uri(properties.opaUrl() + "/v1/data/illamhelp/pii/allow")
          .body(Map.of("input", input))
          .retrieve()
          .body(Map.class);
      return Boolean.TRUE.equals(response == null ? null : response.get("result"));
    } catch (RuntimeException exception) {
      return false;
    }
  }
}
