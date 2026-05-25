package com.illamhelp.api.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.contributor.Status;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class HealthControllerTest {
  @Test
  void returnsOkOnlyWhenActuatorReportsDependenciesUp() {
    ResponseEntity<Map<String, Object>> response = new HealthController(null).healthResponse(Status.UP);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).containsEntry("status", "ok").containsEntry("dependencyStatus", "UP");
  }

  @Test
  void returnsServiceUnavailableWhenActuatorReportsDependencyDown() {
    ResponseEntity<Map<String, Object>> response = new HealthController(null).healthResponse(Status.DOWN);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getBody()).containsEntry("status", "error").containsEntry("dependencyStatus", "DOWN");
  }
}
