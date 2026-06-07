package com.illamhelp.api.profiles;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.consent.ConsentService;
import com.illamhelp.api.notifications.NotificationService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
    verify(verification).submit("u", new VerificationService.SubmitVerificationInput("identity", List.of("m"), null));
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
  void encryptedRegistrationPiiRoundTripsOnlyForTheOwner() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ProfilesService service = new ProfilesService(repository, mock(ConsentService.class), properties());
    ArgumentCaptor<byte[]> email = ArgumentCaptor.forClass(byte[].class);
    ArgumentCaptor<byte[]> phone = ArgumentCaptor.forClass(byte[].class);

    service.upsertFromRegistration("u", "First", "Last", "me@example.com", "+974 5555 1234");
    verify(repository).upsertRegistrationProfile(eq("u"), eq("First"), eq("Last"), any(String[].class),
        email.capture(), phone.capture());
    ProfileRepository.ProfileRow row = mock(ProfileRepository.ProfileRow.class);
    mockDefaultProfileRow(row);
    when(row.getPiiEmailEncrypted()).thenReturn(email.getValue());
    when(row.getPiiPhoneEncrypted()).thenReturn(phone.getValue());
    when(repository.profileRow("u")).thenReturn(row);

    ProfilesService.ProfileContact contact = service.getOwnProfile("u").contact();

    assertThat(contact.email()).isEqualTo("me@example.com");
    assertThat(contact.phone()).isEqualTo("+974 5555 1234");
  }

  @Test
  void returnsOwnProfileAndRejectsMissingProfile() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ProfilesService service = new ProfilesService(repository, mock(ConsentService.class), properties());
    ProfileRepository.ProfileRow ownRow = profileRow();
    when(repository.profileRow("u")).thenReturn(ownRow);

    ProfilesService.ProfileRecord profile = service.getOwnProfile("u");

    assertThat(profile.userId()).isEqualTo("member");
    assertThat(profile.firstName()).isEqualTo("First");
    assertThat(profile.contact().email()).isEqualTo("email@example.com");
    ProfileRepository.ProfileRow missingRow = mockMissingProfileRow();
    when(repository.profileRow("missing")).thenReturn(missingRow);
    assertThatThrownBy(() -> service.getOwnProfile("missing")).isInstanceOf(ApiException.class);
  }

  @Test
  void viewerReceivesOnlyConsentGrantedContactFields() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ConsentService consent = mock(ConsentService.class);
    ProfilesService service = new ProfilesService(repository, consent, properties());
    when(repository.findInternalUserIdByUsername("member")).thenReturn("owner");
    ProfileRepository.ProfileRow ownerRow = profileRow();
    when(repository.profileRow("owner")).thenReturn(ownerRow);
    when(consent.canView(eq("viewer"), any(ConsentService.CanViewInput.class)))
        .thenReturn(new ConsentService.CanViewResponse(false));
    when(consent.canView("viewer", new ConsentService.CanViewInput("owner", "email")))
        .thenReturn(new ConsentService.CanViewResponse(true));

    ProfilesService.ProfileContact contact = service.getProfileForViewer("member", "viewer").contact();

    assertThat(contact.email()).isEqualTo("email@example.com");
    assertThat(contact.phone()).isNull();
    verify(consent).canView("viewer", new ConsentService.CanViewInput("owner", "phone"));
  }

  @Test
  void malformedEncryptedContactIsNotExposed() {
    ProfileRepository repository = mock(ProfileRepository.class);
    ProfilesService service = new ProfilesService(repository, mock(ConsentService.class), properties());
    ProfileRepository.ProfileRow row = profileRow();
    when(row.getPiiEmailEncrypted()).thenReturn("v1:invalid".getBytes());
    when(repository.profileRow("u")).thenReturn(row);

    ProfilesService.ProfileContact contact = service.getOwnProfile("u").contact();

    assertThat(contact.email()).isNull();
  }

  @Test
  void verificationSubmitsAndApprovesValidRequest() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    AuditService audit = mock(AuditService.class);
    ProfilesService profiles = mock(ProfilesService.class);
    NotificationService notifications = mock(NotificationService.class);
    VerificationService service = new VerificationService(repository, audit, profiles, notifications);
    when(repository.activeForUser("u")).thenReturn(List.of());
    VerificationRequestRepository.VerificationRecordRow inserted = verificationRecordRow("r", "u", "identity", "pending", "2026-05-26T10:00:00Z");
    when(repository.insertRequest(org.mockito.ArgumentMatchers.eq("u"), any(String[].class), org.mockito.ArgumentMatchers.eq("identity"),
        org.mockito.ArgumentMatchers.isNull()))
        .thenReturn(inserted);
    VerificationService.VerificationRecord submitted =
        service.submit("u", new VerificationService.SubmitVerificationInput("identity", List.of("m"), null));
    assertThat(submitted.id()).isEqualTo("r");

    VerificationRequestRepository.ReviewTargetRow pendingTarget = reviewTarget("r", "u", "pending");
    when(repository.findReviewTarget("r")).thenReturn(pendingTarget);
    VerificationRequestRepository.VerificationRecordRow approvedRow =
        verificationRecordRow("r", "u", "identity", "approved", "2026-05-26T10:00:00Z");
    when(repository.reviewUpdate("r", "admin", "approved", null))
        .thenReturn(approvedRow);
    VerificationService.VerificationRecord reviewed =
        service.review("r", "admin", new VerificationService.ReviewVerificationInput("approved", null));
    assertThat(reviewed.status()).isEqualTo("approved");
    verify(profiles).setVerified("u", true);
    verify(notifications).create(org.mockito.ArgumentMatchers.eq("u"), org.mockito.ArgumentMatchers.eq("verification_approved"),
        any(), any(), any());
  }

  @Test
  void verificationReturnsNullBeforeFirstSubmission() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    VerificationService service = new VerificationService(repository, mock(AuditService.class),
        mock(ProfilesService.class), mock(NotificationService.class));
    when(repository.latestForUser("u")).thenReturn(null);

    assertThat(service.getMyVerification("u")).isNull();
  }

  @Test
  void verificationAdminListUsesBoundedCursorPage() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    VerificationService service = new VerificationService(repository, mock(AuditService.class),
        mock(ProfilesService.class), mock(NotificationService.class));
    VerificationRequestRepository.VerificationRecordRow row1 =
        verificationRecordRow("r1", "u1", "identity", "pending", "2026-05-26T10:00:00Z");
    VerificationRequestRepository.VerificationRecordRow row2 =
        verificationRecordRow("r2", "u2", "identity", "pending", "2026-05-26T09:00:00Z");
    when(repository.listForAdmin("pending", null, null, 2)).thenReturn(List.of(row1, row2));

    VerificationService.VerificationPage page = service.listForAdmin("pending", 1, null);

    assertThat(page.items()).hasSize(1);
    assertThat(page.nextCursor()).isNotNull();
    verify(repository).listForAdmin("pending", null, null, 2);
  }

  @Test
  void verificationReviewRejectsMissingOrConcurrentlyCompletedRequest() {
    VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    VerificationService service = new VerificationService(repository, mock(AuditService.class),
        mock(ProfilesService.class), notifications);

    assertThatThrownBy(() -> service.review("missing", "admin", new VerificationService.ReviewVerificationInput("approved", null)))
        .isInstanceOf(ApiException.class).hasMessage("Verification request not found");

    VerificationRequestRepository.ReviewTargetRow pendingTarget = reviewTarget("r", "u", "pending");
    when(repository.findReviewTarget("r")).thenReturn(pendingTarget);
    when(repository.reviewUpdate("r", "admin", "approved", null)).thenReturn(null);
    assertThatThrownBy(() -> service.review("r", "admin", new VerificationService.ReviewVerificationInput("approved", null)))
        .isInstanceOf(ApiException.class).hasMessage("Verification request was already reviewed");
    org.mockito.Mockito.verifyNoInteractions(notifications);
  }

  @Test
  void controllerSerializesMissingVerificationAsJsonNull() {
    ProfilesService profiles = mock(ProfilesService.class);
    VerificationService verification = mock(VerificationService.class);
    when(verification.getMyVerification("u")).thenReturn(null);

    Object response = new ProfilesController(profiles, verification).myVerification(jwt("u"));

    assertThat(response).isEqualTo(NullNode.getInstance());
  }

  private ProfileRepository.ProfileRow profileRow() {
    ProfileRepository.ProfileRow row = mock(ProfileRepository.ProfileRow.class);
    mockDefaultProfileRow(row);
    return row;
  }

  private ProfileRepository.ProfileRow mockMissingProfileRow() {
    ProfileRepository.ProfileRow row = mock(ProfileRepository.ProfileRow.class);
    when(row.getFirstName()).thenReturn(null);
    return row;
  }

  private void mockDefaultProfileRow(ProfileRepository.ProfileRow row) {
    when(row.getUsername()).thenReturn("member");
    when(row.getFirstName()).thenReturn("First");
    when(row.getLastName()).thenReturn("Last");
    when(row.getDisplayName()).thenReturn("First Last");
    when(row.getPiiEmailEncrypted()).thenReturn("email@example.com".getBytes());
    when(row.getPiiPhoneEncrypted()).thenReturn("5555".getBytes());
    when(row.getPiiAlternatePhoneEncrypted()).thenReturn(null);
    when(row.getPiiFullAddressEncrypted()).thenReturn(null);
  }

  private VerificationRequestRepository.ReviewTargetRow reviewTarget(String id, String userId, String status) {
    VerificationRequestRepository.ReviewTargetRow row = mock(VerificationRequestRepository.ReviewTargetRow.class);
    when(row.getId()).thenReturn(id);
    when(row.getUserId()).thenReturn(userId);
    when(row.getStatus()).thenReturn(status);
    return row;
  }

  private VerificationRequestRepository.VerificationRecordRow verificationRecordRow(
      String id, String userId, String documentType, String status, String createdAt) {
    VerificationRequestRepository.VerificationRecordRow row = mock(VerificationRequestRepository.VerificationRecordRow.class);
    when(row.getId()).thenReturn(id);
    when(row.getUserId()).thenReturn(userId);
    when(row.getDocumentMediaIds()).thenReturn(new String[]{"m"});
    when(row.getDocumentType()).thenReturn(documentType);
    when(row.getStatus()).thenReturn(status);
    when(row.getNotes()).thenReturn(null);
    when(row.getReviewerUserId()).thenReturn(null);
    when(row.getReviewerNotes()).thenReturn(null);
    when(row.getReviewedAt()).thenReturn(null);
    when(row.getCreatedAt()).thenReturn(createdAt);
    when(row.getUpdatedAt()).thenReturn(createdAt);
    return row;
  }
}
