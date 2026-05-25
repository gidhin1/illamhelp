package com.illamhelp.api.health;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.health.actuate.endpoint.HealthDescriptor;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.boot.health.contributor.Status;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  private final HealthEndpoint healthEndpoint;

  public HealthController(HealthEndpoint healthEndpoint) {
    this.healthEndpoint = healthEndpoint;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, Object>> health() {
    HealthDescriptor actuatorHealth = healthEndpoint.health();
    return healthResponse(actuatorHealth.getStatus());
  }

  ResponseEntity<Map<String, Object>> healthResponse(Status dependencyStatus) {
    boolean ready = Status.UP.equals(dependencyStatus);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("status", ready ? "ok" : "error");
    response.put("service", "illamhelp-api");
    response.put("timestamp", Instant.now().toString());
    response.put("dependencyStatus", dependencyStatus.getCode());
    return ResponseEntity.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(response);
  }
}
