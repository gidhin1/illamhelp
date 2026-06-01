package com.illamhelp.api.health;

import java.time.Instant;
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
  public ResponseEntity<HealthResponse> health() {
    HealthDescriptor actuatorHealth = healthEndpoint.health();
    return healthResponse(actuatorHealth.getStatus());
  }

  ResponseEntity<HealthResponse> healthResponse(Status dependencyStatus) {
    boolean ready = Status.UP.equals(dependencyStatus);
    HealthResponse response = new HealthResponse(
        ready ? "ok" : "error",
        "illamhelp-api",
        Instant.now().toString(),
        dependencyStatus.getCode());
    return ResponseEntity.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(response);
  }

  public record HealthResponse(String status, String service, String timestamp, String dependencyStatus) {
  }
}
