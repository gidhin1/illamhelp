package com.illamhelp.api;

import com.illamhelp.api.config.AppProperties;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;

public final class TestFixtures {
  private TestFixtures() {
  }

  public static Jwt jwt(String subject) {
    return Jwt.withTokenValue("token")
        .header("alg", "none")
        .subject(subject)
        .claim("preferred_username", "member_public")
        .claim("realm_access", Map.of("roles", List.of("both")))
        .issuedAt(Instant.now())
        .expiresAt(Instant.now().plusSeconds(60))
        .build();
  }

  public static AppProperties properties() {
    return new AppProperties(
        "/api/v1", "http://localhost:3000,http://localhost:3001", true, "this-is-a-profile-secret",
        60000, 1, 60000, 2, 30, 60000, 2, 60000, 2, 60000, 2, 60000, 2,
        "http://localhost:8181", "http://localhost:8080", "illamhelp", "web", "", "master",
        "admin-cli", "admin", "password", "http://localhost:9000", "access", "secret",
        "us-east-1", "quarantine", "approved", 10485760, 104857600,
        "image/jpeg,image/png,image/webp", "video/mp4,video/quicktime,video/webm",
        true, "http://localhost:9200", "jobs", 750);
  }
}
