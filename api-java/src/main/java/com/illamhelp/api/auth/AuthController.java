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
  private final PolicyAcceptanceService policyAcceptanceService;
  private final AuthUserService authUserService;
  private final AppProperties properties;

  public AuthController(KeycloakAuthService authService, ProfilesService profilesService,
      PolicyAcceptanceService policyAcceptanceService, AuthUserService authUserService, AppProperties properties) {
    this.authService = authService;
    this.profilesService = profilesService;
    this.policyAcceptanceService = policyAcceptanceService;
    this.authUserService = authUserService;
    this.properties = properties;
  }

  @PostMapping("/auth/login")
  @ResponseStatus(HttpStatus.CREATED)
  public KeycloakAuthService.AuthSession login(@Valid @RequestBody LoginRequest request) {
    return authService.login(request.username(), request.password());
  }

  @PostMapping("/auth/register")
  @ResponseStatus(HttpStatus.CREATED)
  public KeycloakAuthService.AuthSession register(@Valid @RequestBody RegisterRequest request) {
    policyAcceptanceService.validateRegistrationAcceptance(request);
    KeycloakAuthService.AuthSession session = authService.register(request);
    profilesService.upsertFromRegistration(
        session.userId(),
        request.firstName(),
        request.lastName(),
        request.email(),
        request.phone());
    policyAcceptanceService.recordRegistrationAcceptance(session.userId(), request);
    return session;
  }

  @PostMapping("/auth/refresh")
  @ResponseStatus(HttpStatus.CREATED)
  public KeycloakAuthService.AuthSession refresh(@Valid @RequestBody RefreshRequest request) {
    return authService.refresh(request.refreshToken());
  }

  @PostMapping("/auth/logout")
  @ResponseStatus(HttpStatus.CREATED)
  public LogoutResponse logout(@Valid @RequestBody RefreshRequest request) {
    authService.logout(request.refreshToken());
    return new LogoutResponse(true);
  }

  @GetMapping("/auth/me")
  public AuthenticatedUser me(@AuthenticationPrincipal Jwt jwt) {
    AuthenticatedUser user = CurrentUser.fromJwt(jwt, properties.keycloakClientId());
    String analyticsUserId = authUserService.getAnalyticsUserIdByUserId(user.userId()).orElse(null);
    return new AuthenticatedUser(user.userId(), user.publicUserId(), analyticsUserId, user.roles(), user.userType(),
        user.tokenSubject());
  }

  public record LoginRequest(
      @NotBlank @Size(min = 3, max = 120) String username,
      @NotBlank @Size(min = 8, max = 128) String password) {
  }

  public record RefreshRequest(@NotBlank String refreshToken) {
  }

  public record LogoutResponse(boolean success) {
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
      String userType,
      @NotBlank String acceptedTermsVersion,
      @NotBlank String acceptedPrivacyPolicyVersion,
      @NotBlank String acceptedLegalAt,
      @NotBlank String acceptanceSource
  ) {
  }
}
