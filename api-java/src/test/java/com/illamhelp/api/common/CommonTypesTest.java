package com.illamhelp.api.common;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolationException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;

class CommonTypesTest {
  @Test
  void mapsAuthenticatedUserFromJwtAndFallsBackToBothRole() {
    String id = UUID.randomUUID().toString();
    Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject(id).claim("preferred_username", "tester").build();

    AuthenticatedUser user = CurrentUser.fromJwt(jwt);

    assertThat(user.userId()).isEqualTo(id);
    assertThat(user.publicUserId()).isEqualTo("tester");
    assertThat(user.roles()).containsExactly("both");
    assertThat(user.userType()).isEqualTo("both");
  }

  @Test
  void resolvesProviderRoleAndGeneratedPublicId() {
    String id = "12345678-1234-1234-1234-123456789abc";
    Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject(id)
        .claim("realm_access", Map.of("roles", List.of("provider"))).build();

    AuthenticatedUser user = CurrentUser.fromJwt(jwt);

    assertThat(user.userType()).isEqualTo("provider");
    assertThat(user.publicUserId()).isEqualTo("member_1234567812");
  }

  @Test
  void convertsJdbcMapValuesForJsonResponses() {
    UUID uuid = UUID.randomUUID();
    Instant instant = Instant.parse("2026-01-01T00:00:00Z");
    Map<String, Object> row = Map.of("id", uuid, "time", Timestamp.from(instant), "n", 4L, "decimal", new BigDecimal("2.5"));

    assertThat(JsonMaps.uuid(row, "id")).isEqualTo(uuid.toString());
    assertThat(JsonMaps.instant(row, "time")).isEqualTo(instant.toString());
    assertThat(JsonMaps.integer(row, "n")).isEqualTo(4);
    assertThat(JsonMaps.longValue(row, "n")).isEqualTo(4L);
    assertThat(JsonMaps.decimal(row, "decimal")).isEqualByComparingTo("2.5");
  }

  @Test
  void carriesApiStatusAndMapsErrors() {
    ApiException exception = new ApiException(HttpStatus.CONFLICT, "duplicate");
    ApiExceptionHandler handler = new ApiExceptionHandler();

    var api = handler.handleApiException(exception);
    var constraint = handler.handleConstraintViolation(new ConstraintViolationException("bad", null));
    var unknown = handler.handleUnhandled(new RuntimeException("hidden"));

    assertThat(exception.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(api.getBody().message()).isEqualTo("duplicate");
    assertThat(constraint.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(unknown.getBody().message()).isEqualTo("Internal server error");
  }
}
