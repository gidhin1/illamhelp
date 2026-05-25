package com.illamhelp.api.auth;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.profiles.ProfilesService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class AuthTests {
  @Test
  void controllerDelegatesAuthenticationAndRegistrationProfileCreation() {
    KeycloakAuthService auth = mock(KeycloakAuthService.class);
    ProfilesService profiles = mock(ProfilesService.class);
    AuthController controller = new AuthController(auth, profiles);
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
}
