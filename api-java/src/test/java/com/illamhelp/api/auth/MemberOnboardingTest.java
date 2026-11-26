package com.illamhelp.api.auth;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.profiles.ProfileRepository;
import com.illamhelp.api.profiles.ProfilesService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class MemberOnboardingTest {
  private final UUID memberId = UUID.randomUUID();
  private final UserRepository users = mock(UserRepository.class);
  private final ProfileRepository profiles = mock(ProfileRepository.class);
  private final ProfilesService profileService = mock(ProfilesService.class);
  private final PolicyAcceptanceService policies = mock(PolicyAcceptanceService.class);
  private final MemberOnboarding onboarding = new MemberOnboarding(properties(), users, profiles, profileService, policies);
  private final MemberOnboarding.Request request = new MemberOnboarding.Request(
      "New.Member", "New", "Member", LegalPolicyVersions.TERMS, LegalPolicyVersions.PRIVACY_POLICY);

  @Test
  void apiRequiresAnAccessTokenFromAnIllamHelpClient() {
    assertThat(onboarding.allowsApiAccess(token("illamhelp-api", "Bearer").build())).isTrue();
    assertThat(onboarding.allowsApiAccess(token("account-console", "Bearer").build())).isFalse();
    assertThat(onboarding.allowsApiAccess(token("illamhelp-api", "ID").build())).isFalse();
  }

  @Test
  void checksAudienceStaffAndOnboardingBeforeMemberActions() {
    var verified = token("illamhelp-member-web", "Bearer").build();
    assertThat(onboarding.allowsApiAccess(verified)).isFalse();
    when(profiles.existsByUserId(memberId)).thenReturn(true);
    when(policies.hasCurrentAcceptance(memberId)).thenReturn(true);
    assertThat(onboarding.allowsApiAccess(verified)).isTrue();
    assertThat(onboarding.allowsApiAccess(token("illamhelp-member-web", "Bearer").audience(List.of("account")).build()))
        .isFalse();
    Jwt staff = token("illamhelp-member-web", "Bearer")
        .claim("resource_access", Map.of("illamhelp-api", Map.of("roles", List.of("support")))).build();
    assertThat(onboarding.allowsApiAccess(staff)).isFalse();
  }

  @Test
  void createsProfileWithVerifiedEmailAndRecordsPolicySourceFromClient() {
    when(users.lockMember(memberId)).thenReturn(Optional.of(new UserEntity()));
    var verified = token("illamhelp-member-android", "Bearer").build();

    assertThat(onboarding.complete(verified, request).complete()).isTrue();
    verify(users).createMemberIfAbsent(memberId, "new.member");
    verify(profileService).upsertFromRegistration(memberId.toString(), "New", "Member", "member@example.test", null);
    verify(policies).recordMissingAcceptance(memberId, "mobile");
  }

  @Test
  void rejectsUnverifiedEmailAndKeepsCompletedProfilesIntactOnRetry() {
    when(users.lockMember(memberId)).thenReturn(Optional.of(new UserEntity()));
    var unverified = token("illamhelp-member-ios", "Bearer").claim("email_verified", false).build();
    assertThatThrownBy(() -> onboarding.complete(unverified, request)).isInstanceOf(ApiException.class)
        .hasMessageContaining("Verify your email");
    when(profiles.existsByUserId(memberId)).thenReturn(true);
    when(policies.hasCurrentAcceptance(memberId)).thenReturn(true);
    assertThat(onboarding.complete(unverified, request).complete()).isTrue();
    verifyNoInteractions(profileService);
  }

  @Test
  void unavailableUsernameDoesNotWriteProfileOrAcceptance() {
    var verified = token("illamhelp-member-web", "Bearer").build();
    assertThatThrownBy(() -> onboarding.complete(verified, request)).isInstanceOf(ApiException.class)
        .hasMessageContaining("That username is taken");
    verifyNoInteractions(profileService);
  }

  private Jwt.Builder token(String client, String type) {
    return Jwt.withTokenValue("test").header("alg", "RS256").subject(memberId.toString())
        .audience(List.of("illamhelp-api")).claim("azp", client).claim("typ", type)
        .claim("email", "member@example.test").claim("email_verified", true);
  }
}
