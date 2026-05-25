package com.illamhelp.api.auth;

import com.illamhelp.api.auth.AuthController.RegisterRequest;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Service
public class KeycloakAuthService {
  private final AppProperties properties;
  private final AuthUserService authUserService;
  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public KeycloakAuthService(AppProperties properties, AuthUserService authUserService, RestClient.Builder builder, ObjectMapper objectMapper) {
    this.properties = properties;
    this.authUserService = authUserService;
    this.restClient = builder.build();
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> login(String username, String password) {
    Map<String, Object> token = token(Map.of(
        "grant_type", "password",
        "username", username,
        "password", password));
    String subject = decodePayload(token.get("access_token")).path("sub").asText();
    List<String> roles = normalizeAppRoles(extractRoles(decodePayload(token.get("access_token"))));
    authUserService.syncUserFromToken(subject, roles, username);
    return session(token, subject, username, roles);
  }

  @Transactional
  public Map<String, Object> register(RegisterRequest request) {
    String username = request.username().trim().toLowerCase();
    String provisionalUserId = UUID.randomUUID().toString();
    String adminToken = adminAccessToken();
    String keycloakUserId = createUser(adminToken, provisionalUserId, username, request);
    ensureRealmRole(adminToken, "both");
    assignRealmRoles(adminToken, keycloakUserId, List.of(realmRole(adminToken, "both")));

    Map<String, Object> token = token(Map.of(
        "grant_type", "password",
        "username", username,
        "password", request.password()));
    JsonNode payload = decodePayload(token.get("access_token"));
    String userId = payload.path("sub").asText(keycloakUserId);
    List<String> roles = normalizeAppRoles(extractRoles(payload));
    authUserService.syncUserFromToken(userId, roles, username);
    return session(token, userId, username, roles);
  }

  public Map<String, Object> refresh(String refreshToken) {
    Map<String, Object> token = token(Map.of("grant_type", "refresh_token", "refresh_token", refreshToken));
    JsonNode payload = decodePayload(token.get("access_token"));
    String userId = payload.path("sub").asText();
    List<String> roles = normalizeAppRoles(extractRoles(payload));
    String username = authUserService.getUsernameByUserId(userId).orElse(userId);
    authUserService.syncUserFromToken(userId, roles, username);
    return session(token, userId, username, roles);
  }

  public void logout(String refreshToken) {
    LinkedMultiValueMap<String, String> form = clientCredentials();
    form.add("refresh_token", refreshToken);
    restClient.post()
        .uri(tokenBase() + "/logout")
        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
        .body(form)
        .retrieve()
        .toBodilessEntity();
  }

  private Map<String, Object> token(Map<String, String> values) {
    LinkedMultiValueMap<String, String> form = clientCredentials();
    values.forEach(form::add);
    try {
      return restClient.post()
          .uri(tokenBase() + "/token")
          .contentType(MediaType.APPLICATION_FORM_URLENCODED)
          .body(form)
          .retrieve()
          .body(Map.class);
    } catch (RuntimeException exception) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }
  }

  private String adminAccessToken() {
    if (properties.keycloakAdminUsername() == null || properties.keycloakAdminUsername().isBlank()
        || properties.keycloakAdminPassword() == null || properties.keycloakAdminPassword().isBlank()) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Keycloak admin credentials are not configured");
    }
    LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("grant_type", "password");
    form.add("client_id", properties.keycloakAdminClientId());
    form.add("username", properties.keycloakAdminUsername());
    form.add("password", properties.keycloakAdminPassword());
    try {
      Map<String, Object> response = restClient.post()
          .uri(properties.keycloakUrl() + "/realms/" + properties.keycloakAdminRealm() + "/protocol/openid-connect/token")
          .contentType(MediaType.APPLICATION_FORM_URLENCODED)
          .body(form)
          .retrieve()
          .body(Map.class);
      Object accessToken = response == null ? null : response.get("access_token");
      if (accessToken == null) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, "Unable to get Keycloak admin access token");
      }
      return String.valueOf(accessToken);
    } catch (RuntimeException exception) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Unable to get Keycloak admin access token");
    }
  }

  private String createUser(String adminToken, String userId, String username, RegisterRequest request) {
    Map<String, Object> passwordCredential = Map.of(
        "type", "password",
        "value", request.password(),
        "temporary", false);
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("id", userId);
    payload.put("username", username);
    payload.put("email", request.email().trim().toLowerCase());
    payload.put("firstName", request.firstName().trim());
    payload.put("lastName", request.lastName() == null || request.lastName().isBlank()
        ? request.firstName().trim()
        : request.lastName().trim());
    payload.put("enabled", true);
    payload.put("emailVerified", false);
    payload.put("credentials", List.of(passwordCredential));

    try {
      URI location = restClient.post()
          .uri(properties.keycloakUrl() + "/admin/realms/" + properties.keycloakRealm() + "/users")
          .header("Authorization", "Bearer " + adminToken)
          .contentType(MediaType.APPLICATION_JSON)
          .body(payload)
          .retrieve()
          .toBodilessEntity()
          .getHeaders()
          .getLocation();
      if (location == null || location.getPath() == null || !location.getPath().contains("/")) {
        return userId;
      }
      return location.getPath().substring(location.getPath().lastIndexOf('/') + 1);
    } catch (RuntimeException exception) {
      throw new ApiException(HttpStatus.CONFLICT, "Unable to create account with provided credentials");
    }
  }

  private void ensureRealmRole(String adminToken, String roleName) {
    try {
      realmRole(adminToken, roleName);
    } catch (ApiException missing) {
      restClient.post()
          .uri(properties.keycloakUrl() + "/admin/realms/" + properties.keycloakRealm() + "/roles")
          .header("Authorization", "Bearer " + adminToken)
          .contentType(MediaType.APPLICATION_JSON)
          .body(Map.of("name", roleName))
          .retrieve()
          .toBodilessEntity();
    }
  }

  private Map<String, Object> realmRole(String adminToken, String roleName) {
    try {
      return restClient.get()
          .uri(properties.keycloakUrl() + "/admin/realms/" + properties.keycloakRealm() + "/roles/" + roleName)
          .header("Authorization", "Bearer " + adminToken)
          .retrieve()
          .body(Map.class);
    } catch (RuntimeException exception) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Failed to fetch realm role '" + roleName + "'");
    }
  }

  private void assignRealmRoles(String adminToken, String userId, List<Map<String, Object>> roles) {
    restClient.post()
        .uri(properties.keycloakUrl() + "/admin/realms/" + properties.keycloakRealm() + "/users/" + userId + "/role-mappings/realm")
        .header("Authorization", "Bearer " + adminToken)
        .contentType(MediaType.APPLICATION_JSON)
        .body(roles)
        .retrieve()
        .toBodilessEntity();
  }

  private LinkedMultiValueMap<String, String> clientCredentials() {
    LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("client_id", properties.keycloakClientId());
    if (properties.keycloakClientSecret() != null && !properties.keycloakClientSecret().isBlank()) {
      form.add("client_secret", properties.keycloakClientSecret());
    }
    return form;
  }

  private String tokenBase() {
    return properties.keycloakUrl() + "/realms/" + properties.keycloakRealm() + "/protocol/openid-connect";
  }

  private Map<String, Object> session(Map<String, Object> token, String userId, String username, List<String> roles) {
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("userId", userId);
    response.put("publicUserId", username);
    response.put("username", username);
    response.put("userType", userTypeFromRoles(roles));
    response.put("roles", roles);
    response.put("accessToken", token.get("access_token"));
    response.put("expiresIn", token.get("expires_in"));
    response.put("refreshToken", token.get("refresh_token"));
    response.put("refreshExpiresIn", token.get("refresh_expires_in"));
    response.put("tokenType", token.getOrDefault("token_type", "Bearer"));
    response.put("scope", token.get("scope"));
    return response;
  }

  private JsonNode decodePayload(Object token) {
    if (!(token instanceof String accessToken)) {
      return objectMapper.createObjectNode();
    }
    String[] parts = accessToken.split("\\.");
    if (parts.length < 2) {
      return objectMapper.createObjectNode();
    }
    try {
      return objectMapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
    } catch (RuntimeException exception) {
      return objectMapper.createObjectNode();
    } catch (Exception exception) {
      return objectMapper.createObjectNode();
    }
  }

  private List<String> extractRoles(JsonNode payload) {
    List<String> roles = new ArrayList<>();
    payload.path("realm_access").path("roles").forEach(role -> roles.add(role.asText()));
    payload.path("resource_access").fields().forEachRemaining(entry ->
        entry.getValue().path("roles").forEach(role -> roles.add(role.asText())));
    return roles;
  }

  private List<String> normalizeAppRoles(List<String> roles) {
    List<String> normalized = new ArrayList<>();
    for (String role : roles) {
      String mapped = switch (role) {
        case "realm-admin", "manage-realm", "view-realm", "manage-users", "view-users", "query-users", "manage-clients", "view-clients", "query-clients" -> "admin";
        case "admin", "support", "seeker", "provider", "both" -> role;
        default -> null;
      };
      if (mapped != null && !normalized.contains(mapped)) {
        normalized.add(mapped);
      }
    }
    if (normalized.isEmpty()) {
      normalized.add("both");
    }
    return normalized;
  }

  private String userTypeFromRoles(List<String> roles) {
    if (roles.contains("provider") && !roles.contains("seeker")) {
      return "provider";
    }
    if (roles.contains("seeker") && !roles.contains("provider")) {
      return "seeker";
    }
    return "both";
  }
}
