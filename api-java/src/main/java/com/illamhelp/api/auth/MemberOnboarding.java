package com.illamhelp.api.auth;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CurrentUser;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.profiles.ProfileRepository;
import com.illamhelp.api.profiles.ProfilesService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberOnboarding {
  private static final Map<String, String> CLIENTS = Map.of(
      "illamhelp-member-web", "web",
      "illamhelp-member-android", "mobile",
      "illamhelp-member-ios", "mobile");

  private final AppProperties properties;
  private final UserRepository users;
  private final ProfileRepository profiles;
  private final ProfilesService profileService;
  private final PolicyAcceptanceService policies;

  public MemberOnboarding(AppProperties properties, UserRepository users, ProfileRepository profiles,
      ProfilesService profileService, PolicyAcceptanceService policies) {
    this.properties = properties;
    this.users = users;
    this.profiles = profiles;
    this.profileService = profileService;
    this.policies = policies;
  }

  public static boolean isMemberClient(Jwt token) {
    String client = token.getClaimAsString("azp");
    return client != null && CLIENTS.containsKey(client);
  }

  public boolean allowsApiAccess(Jwt token) {
    if (!"Bearer".equals(token.getClaimAsString("typ"))) {
      return false;
    }
    if (!isMemberClient(token)) {
      return properties.keycloakClientId().equals(token.getClaimAsString("azp"));
    }
    try {
      return status(token).complete();
    } catch (ApiException exception) {
      return false;
    }
  }

  public Status status(Jwt token) {
    UUID id = requireMember(token);
    return new Status(isComplete(id), LegalPolicyVersions.TERMS, LegalPolicyVersions.PRIVACY_POLICY);
  }

  @Transactional
  public Status complete(Jwt token, Request request) {
    UUID id = requireMember(token);
    policies.validatePolicyVersions(request.acceptedTermsVersion(), request.acceptedPrivacyPolicyVersion());
    if (!isComplete(id)) {
      users.createMemberIfAbsent(id, request.username().toLowerCase(Locale.ROOT));
      UserEntity member = users.lockMember(id)
          .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "That username is taken. Try another."));
      rejectStaff(member.getRole());
      if (!profiles.existsByUserId(id)) {
        String email = token.getClaimAsString("email");
        if (!Boolean.TRUE.equals(token.getClaimAsBoolean("email_verified"))
            || email == null || email.isBlank() || email.length() > 120) {
          throw new ApiException(HttpStatus.FORBIDDEN, "Verify your email before creating your profile.");
        }
        profileService.upsertFromRegistration(id.toString(), request.firstName(), request.lastName(), email, null);
      }
      policies.recordMissingAcceptance(id, CLIENTS.get(token.getClaimAsString("azp")));
    }
    return new Status(true, LegalPolicyVersions.TERMS, LegalPolicyVersions.PRIVACY_POLICY);
  }

  private boolean isComplete(UUID id) {
    return profiles.existsByUserId(id) && policies.hasCurrentAcceptance(id);
  }

  private UUID requireMember(Jwt token) {
    if (!isMemberClient(token) || !"Bearer".equals(token.getClaimAsString("typ"))
        || token.getAudience() == null || !token.getAudience().contains(properties.keycloakClientId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Sign in with the IllamHelp member app.");
    }
    UUID id;
    try {
      id = UUID.fromString(token.getSubject());
    } catch (IllegalArgumentException | NullPointerException exception) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Invalid member identity. Sign in again.");
    }
    CurrentUser.fromJwt(token, properties.keycloakClientId()).roles().forEach(this::rejectStaff);
    users.findById(id).ifPresent(member -> rejectStaff(member.getRole()));
    return id;
  }

  private void rejectStaff(String role) {
    if ("admin".equals(role) || "support".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Use the staff sign-in page.");
    }
  }

  public record Status(boolean complete, String termsVersion, String privacyPolicyVersion) {}

  public record Request(
      @NotBlank @Size(min = 3, max = 40) @Pattern(regexp = "[a-zA-Z0-9._-]+") String username,
      @NotBlank @Size(min = 2, max = 80) String firstName,
      @Size(max = 80) String lastName,
      @NotBlank String acceptedTermsVersion,
      @NotBlank String acceptedPrivacyPolicyVersion) {}
}
