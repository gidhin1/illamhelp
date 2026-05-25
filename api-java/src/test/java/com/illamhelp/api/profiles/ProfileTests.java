package com.illamhelp.api.profiles;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.consent.ConsentService;
import com.illamhelp.api.notifications.NotificationService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.NullNode;

class ProfileTests {
  @Test
  void controllerDelegatesProfileAndVerificationActions() {
    ProfilesService profiles = mock(ProfilesService.class);
    VerificationService verification = mock(VerificationService.class);
    ProfilesController controller = new ProfilesController(profiles, verification);
    var update = new ProfilesService.UpdateProfileRequest("A", null, null, null, null, null, null, null, null);
    controller.me(jwt("u"));
    controller.dashboard(jwt("u"));
    controller.updateMe(update, jwt("u"));
    controller.submitVerification(new ProfilesController.SubmitVerificationRequest("identity", List.of("m"), null), jwt("u"));
    verify(profiles).getOwnProfile("u");
    verify(profiles).dashboard("u");
    verify(profiles).updateOwnProfile("u", update);
    Map<String, Object> submission = new LinkedHashMap<>();
    submission.put("documentType", "identity");
    submission.put("documentMediaIds", List.of("m"));
    submission.put("notes", null);
    verify(verification).submit("u", submission);
  }

  @Test
  void registrationEncryptsPiiAndMasksContact() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ProfilesService service = new ProfilesService(repository, mock(ConsentService.class), properties());

    service.upsertFromRegistration("u", " First ", " Last ", "me@example.com", "+974 5555 1234");

    verify(repository).updateMaskedContact("u", "m***@example.com", "****1234");
    verify(repository).upsertRegistrationProfile(
        org.mockito.ArgumentMatchers.eq("u"), org.mockito.ArgumentMatchers.eq("First"), org.mockito.ArgumentMatchers.eq("Last"),
        any(String[].class), any(byte[].class), any(byte[].class));
  }

  @Test
  void returnsOwnProfileAndRejectsMissingProfile() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ProfilesService service = new ProfilesService(repository, mock(ConsentService.class), properties());
    when(repository.profileRow("u")).thenReturn(profileRow());

    Map<String, Object> profile = service.getOwnProfile("u");

    assertThat(profile).containsEntry("userId", "member").containsEntry("firstName", "First");
    assertThat(((Map<?, ?>) profile.get("contact")).get("email")).isEqualTo("email@example.com");
    when(repository.profileRow("missing")).thenReturn(Map.of());
    assertThatThrownBy(() -> service.getOwnProfile("missing")).isInstanceOf(ApiException.class);
  }

  @Test
  void verificationSubmitsAndApprovesValidRequest() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    AuditService audit = mock(AuditService.class);
    ProfilesService profiles = mock(ProfilesService.class);
    NotificationService notifications = mock(NotificationService.class);
    VerificationService service = new VerificationService(repository, audit, profiles, notifications);
    when(repository.activeForUser("u")).thenReturn(List.of());
    when(repository.insertRequest(org.mockito.ArgumentMatchers.eq("u"), any(String[].class), org.mockito.ArgumentMatchers.eq("identity"),
        org.mockito.ArgumentMatchers.isNull()))
        .thenReturn(Map.of("id", "r", "documentType", "identity"));
    assertThat(service.submit("u", Map.of("documentMediaIds", List.of("m")))).containsEntry("id", "r");

    when(repository.findReviewTarget("r")).thenReturn(Map.of("userId", "u", "status", "pending"));
    when(repository.reviewUpdate("r", "admin", "approved", null)).thenReturn(Map.of("status", "approved"));
    assertThat(service.review("r", "admin", Map.of("decision", "approved"))).containsEntry("status", "approved");
    verify(profiles).setVerified("u", true);
    verify(notifications).create(org.mockito.ArgumentMatchers.eq("u"), org.mockito.ArgumentMatchers.eq("verification_approved"),
        any(), any(), any());
  }

  @Test
  void verificationReturnsNullBeforeFirstSubmission() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    VerificationService service = new VerificationService(repository, mock(AuditService.class),
        mock(ProfilesService.class), mock(NotificationService.class));
    when(repository.latestForUser("u")).thenReturn(Map.of());

    assertThat(service.getMyVerification("u")).isNull();
  }

  @Test
  void controllerSerializesMissingVerificationAsJsonNull() {
    ProfilesService profiles = mock(ProfilesService.class);
    VerificationService verification = mock(VerificationService.class);
    when(verification.getMyVerification("u")).thenReturn(null);

    Object response = new ProfilesController(profiles, verification).myVerification(jwt("u"));

    assertThat(response).isEqualTo(NullNode.getInstance());
  }

  private Map<String, Object> profileRow() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("username", "member");
    row.put("first_name", "First");
    row.put("last_name", "Last");
    row.put("display_name", "First Last");
    row.put("pii_email_encrypted", "email@example.com".getBytes());
    row.put("pii_phone_encrypted", "5555".getBytes());
    row.put("pii_alternate_phone_encrypted", null);
    row.put("pii_full_address_encrypted", null);
    return row;
  }
}
