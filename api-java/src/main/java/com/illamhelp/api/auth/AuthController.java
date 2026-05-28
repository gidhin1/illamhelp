package com.illamhelp.api.auth;

import com.illamhelp.api.common.AuthenticatedUser;
import com.illamhelp.api.common.CurrentUser;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.profiles.ProfilesService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
  private final KeycloakAuthService authService;
  private final ProfilesService profilesService;
  private final AppProperties properties;

  public AuthController(KeycloakAuthService authService, ProfilesService profilesService, AppProperties properties) {
    this.authService = authService;
    this.profilesService = profilesService;
    this.properties = properties;
  }

  @PostMapping("/auth/login")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
    return authService.login(request.username(), request.password());
  }

  @PostMapping("/auth/register")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> register(@Valid @RequestBody RegisterRequest request) {
    Map<String, Object> session = authService.register(request);
    profilesService.upsertFromRegistration(
        String.valueOf(session.get("userId")),
        request.firstName(),
        request.lastName(),
        request.email(),
        request.phone());
    return session;
  }

  @PostMapping("/auth/refresh")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> refresh(@Valid @RequestBody RefreshRequest request) {
    return authService.refresh(request.refreshToken());
  }

  @PostMapping("/auth/logout")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Boolean> logout(@Valid @RequestBody RefreshRequest request) {
    authService.logout(request.refreshToken());
    return Map.of("success", true);
  }

  @GetMapping("/auth/me")
  public AuthenticatedUser me(@AuthenticationPrincipal Jwt jwt) {
    return CurrentUser.fromJwt(jwt, properties.keycloakClientId());
  }

  public record LoginRequest(
      @NotBlank @Size(min = 3, max = 120) String username,
      @NotBlank @Size(min = 8, max = 128) String password) {
  }

  public record RefreshRequest(@NotBlank String refreshToken) {
  }

  public record RegisterRequest(
      @NotBlank @Size(min = 3, max = 64) @Pattern(regexp = "^[a-zA-Z0-9._-]+$") String username,
      @NotBlank @Size(min = 8, max = 128)
          @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$",
              message = "must include at least one uppercase letter, one lowercase letter, and one number") String password,
      @NotBlank @Size(min = 2, max = 80) String firstName,
      @Size(max = 80) String lastName,
      @NotBlank @Email @Size(max = 120) String email,
      @Size(min = 8, max = 20) @Pattern(regexp = "^[+0-9][0-9\\s-]{7,19}$") String phone,
      String userType
  ) {
  }
}
