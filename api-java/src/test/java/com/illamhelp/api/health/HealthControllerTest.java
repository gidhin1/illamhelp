package com.illamhelp.api.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.health.contributor.Status;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class HealthControllerTest {
  @Test
  void returnsOkOnlyWhenActuatorReportsDependenciesUp() {
    ResponseEntity<HealthController.HealthResponse> response = new HealthController(null).healthResponse(Status.UP);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).extracting(HealthController.HealthResponse::status).isEqualTo("ok");
    assertThat(response.getBody()).extracting(HealthController.HealthResponse::dependencyStatus).isEqualTo("UP");
  }

  @Test
  void returnsServiceUnavailableWhenActuatorReportsDependencyDown() {
    ResponseEntity<HealthController.HealthResponse> response = new HealthController(null).healthResponse(Status.DOWN);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getBody()).extracting(HealthController.HealthResponse::status).isEqualTo("error");
    assertThat(response.getBody()).extracting(HealthController.HealthResponse::dependencyStatus).isEqualTo("DOWN");
  }
}
