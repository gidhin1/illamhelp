package com.illamhelp.api.auth;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withCreatedEntity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.profiles.ProfilesService;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.Method;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AuthTests {
  @Test
  void controllerDelegatesAuthenticationAndRegistrationProfileCreation() {
    KeycloakAuthService auth = mock(KeycloakAuthService.class);
    ProfilesService profiles = mock(ProfilesService.class);
    AuthController controller = new AuthController(auth, profiles, properties());
    var register = new AuthController.RegisterRequest("member", "password", "First", "Last", "m@test.io", "1234", "both");
    when(auth.login("u", "p")).thenReturn(Map.of("accessToken", "token"));
    when(auth.register(register)).thenReturn(Map.of("userId", "u1"));

    assertThat(controller.login(new AuthController.LoginRequest("u", "p"))).containsEntry("accessToken", "token");
    assertThat(controller.register(register)).containsEntry("userId", "u1");
    assertThat(controller.logout(new AuthController.RefreshRequest("refresh"))).containsEntry("success", true);
    assertThat(controller.me(jwt("u1")).userId()).isEqualTo("u1");
    verify(auth).login("u", "p");
    verify(profiles).upsertFromRegistration("u1", "First", "Last", "m@test.io", "1234");
    verify(auth).logout("refresh");
  }

  @Test
  void synchronizesUsersWithApplicationRoleAndNormalizedUsername() {
    UserRepository repository = mock(UserRepository.class);
    AuthUserService service = new AuthUserService(repository);
    String id = UUID.randomUUID().toString();

    service.syncUserFromToken(id, List.of("admin"), " Member.One ");
    service.syncUserFromToken(id, List.of(), "invalid name!");

    verify(repository).upsertFromToken(id, "admin", "member.one");
    verify(repository).upsertFromToken(id, "both", "member_" + id.replace("-", "").substring(0, 10));
  }

  @Test
  void readsUsernameFromMappedEntity() throws Exception {
    UserRepository repository = mock(UserRepository.class);
    UserEntity entity = new UserEntity();
    var field = UserEntity.class.getDeclaredField("username");
    field.setAccessible(true);
    field.set(entity, "public_member");
    UUID id = UUID.randomUUID();
    when(repository.findById(id)).thenReturn(Optional.of(entity));

    assertThat(new AuthUserService(repository).getUsernameByUserId(id.toString())).contains("public_member");
  }

  @Test
  void keycloakLoginMapsTransportFailureToUnauthorizedApiError() {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    RestClient client = mock(RestClient.class);
    when(builder.build()).thenReturn(client);
    KeycloakAuthService service = new KeycloakAuthService(properties(), mock(AuthUserService.class), builder, new ObjectMapper());

    assertThatThrownBy(() -> service.login("bad", "bad"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Invalid credentials");
  }

  @Test
  void keycloakLoginSynchronizesOnlyApplicationClientRolesFromReturnedToken() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    AuthUserService users = mock(AuthUserService.class);
    KeycloakAuthService service = new KeycloakAuthService(properties(), users, builder, new ObjectMapper());
    String payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""
        {"sub":"user-1","resource_access":{"account":{"roles":["admin"]},"illamhelp-api":{"roles":["provider"]}}}
        """.getBytes(StandardCharsets.UTF_8));
    String token = "header." + payload + ".signature";
    server.expect(requestTo("http://localhost:8080/realms/illamhelp/protocol/openid-connect/token"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess("""
            {"access_token":"%s","refresh_token":"refresh","expires_in":300,"refresh_expires_in":600}
            """.formatted(token), MediaType.APPLICATION_JSON));

    Map<String, Object> session = service.login("provider.name", "secret");

    assertThat(session).containsEntry("userId", "user-1").containsEntry("userType", "provider");
    assertThat(session.get("roles")).isEqualTo(List.of("provider"));
    verify(users).syncUserFromToken("user-1", List.of("provider"), "provider.name");
    server.verify();
  }

  @Test
  void keycloakRegistrationCreatesAccountAssignsDefaultRoleAndStartsSession() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    AuthUserService users = mock(AuthUserService.class);
    KeycloakAuthService service = new KeycloakAuthService(properties(), users, builder, new ObjectMapper());
    String payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""
        {"sub":"created-user","resource_access":{"illamhelp-api":{"roles":["both","ignored"]}}}
        """.getBytes(StandardCharsets.UTF_8));
    String token = "header." + payload + ".signature";
    var request = new AuthController.RegisterRequest(
        " New.Member ", "StrongPass#2026", " Anita ", "", " Anita@Example.com ", null, "both");

    server.expect(requestTo("http://localhost:8080/realms/master/protocol/openid-connect/token"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess("{\"access_token\":\"admin-token\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("http://localhost:8080/admin/realms/illamhelp/users"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withCreatedEntity(java.net.URI.create(
            "http://localhost:8080/admin/realms/illamhelp/users/created-user")));
    server.expect(requestTo("http://localhost:8080/admin/realms/illamhelp/clients?clientId=illamhelp-api"))
        .andRespond(withSuccess("[{\"id\":\"client-internal\"}]", MediaType.APPLICATION_JSON));
    server.expect(requestTo("http://localhost:8080/admin/realms/illamhelp/clients/client-internal/roles/both"))
        .andRespond(withSuccess("{\"id\":\"role-id\",\"name\":\"both\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("http://localhost:8080/admin/realms/illamhelp/clients/client-internal/roles/both"))
        .andRespond(withSuccess("{\"id\":\"role-id\",\"name\":\"both\"}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("http://localhost:8080/admin/realms/illamhelp/users/created-user/role-mappings/clients/client-internal"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess());
    server.expect(requestTo("http://localhost:8080/realms/illamhelp/protocol/openid-connect/token"))
        .andRespond(withSuccess("""
            {"access_token":"%s","refresh_token":"refresh","expires_in":300,"token_type":"Bearer"}
            """.formatted(token), MediaType.APPLICATION_JSON));

    Map<String, Object> session = service.register(request);

    assertThat(session).containsEntry("userId", "created-user")
        .containsEntry("username", "new.member").containsEntry("userType", "both");
    assertThat(session.get("roles")).isEqualTo(List.of("both"));
    verify(users).syncUserFromToken("created-user", List.of("both"), "new.member");
    server.verify();
  }

  @Test
  void refreshUsesStoredUsernameAndLogoutEndsKeycloakSession() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    AuthUserService users = mock(AuthUserService.class);
    when(users.getUsernameByUserId("refreshed-user")).thenReturn(Optional.of("public_name"));
    KeycloakAuthService service = new KeycloakAuthService(properties(), users, builder, new ObjectMapper());
    String payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""
        {"sub":"refreshed-user","resource_access":{"illamhelp-api":{"roles":["seeker"]}}}
        """.getBytes(StandardCharsets.UTF_8));
    String token = "header." + payload + ".signature";
    server.expect(requestTo("http://localhost:8080/realms/illamhelp/protocol/openid-connect/token"))
        .andRespond(withSuccess("{\"access_token\":\"" + token + "\",\"expires_in\":120}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("http://localhost:8080/realms/illamhelp/protocol/openid-connect/logout"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess());

    assertThat(service.refresh("refresh-token")).containsEntry("username", "public_name")
        .containsEntry("userType", "seeker");
    service.logout("refresh-token");

    verify(users).syncUserFromToken("refreshed-user", List.of("seeker"), "public_name");
    server.verify();
  }

  @Test
  void registrationFailsClearlyWhenAdminCredentialsAreUnavailable() {
    AppProperties missingAdminCredentials = new AppProperties(
        "/api/v1", "http://localhost:3000", true, "", false, "secret", 60000, 1, 60000, 2, 30,
        60000, 2, 60000, 2, 60000, 2, 60000, 2, "http://localhost:8181", "http://localhost:8080",
        "illamhelp", "illamhelp-api", "", "master", "admin-cli", "", "", "http://localhost:9000",
        "access", "secret", "us-east-1", "quarantine", "approved", 1, 1, "image/jpeg", "video/mp4",
        true, "http://localhost:9200", "search", "password", "jobs", 750);
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    KeycloakAuthService service = new KeycloakAuthService(
        missingAdminCredentials, mock(AuthUserService.class), builder, new ObjectMapper());

    assertThatThrownBy(() -> service.register(new AuthController.RegisterRequest(
        "member", "password", "First", null, "m@test.io", null, "both")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Keycloak admin credentials are not configured");
  }

  @Test
  @SuppressWarnings("unchecked")
  void keycloakRoleSyncReadsOnlyApplicationClientRoles() throws Exception {
    RestClient.Builder builder = mock(RestClient.Builder.class);
    when(builder.build()).thenReturn(mock(RestClient.class));
    ObjectMapper mapper = new ObjectMapper();
    KeycloakAuthService service = new KeycloakAuthService(properties(), mock(AuthUserService.class), builder, mapper);
    Method extract = KeycloakAuthService.class.getDeclaredMethod("extractAppRoles",
        com.fasterxml.jackson.databind.JsonNode.class);
    extract.setAccessible(true);

    List<String> roles = (List<String>) extract.invoke(service, mapper.readTree("""
        {"realm_access":{"roles":["admin"]},"resource_access":{
          "unrelated-client":{"roles":["admin"]},"illamhelp-api":{"roles":["support"]}
        }}
        """));

    assertThat(roles).containsExactly("support");
  }
}
