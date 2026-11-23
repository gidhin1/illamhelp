package com.illamhelp.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.illamhelp.api.analytics.AnalyticsEventPublisher;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.auth.AuthUserService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class VerificationServiceTest {
  private final VerificationRequestRepository repository = mock(VerificationRequestRepository.class);
  private final AuditService audit = mock(AuditService.class);
  private final ProfilesService profiles = mock(ProfilesService.class);
  private final NotificationService notifications = mock(NotificationService.class);
  private final AuthUserService users = mock(AuthUserService.class);
  private final AnalyticsEventPublisher analytics = mock(AnalyticsEventPublisher.class);
  private final VerificationService service = new VerificationService(repository, audit, profiles, notifications, users, analytics);

  @Test
  void rejectsMediaThatIsNotAnEligibleDocumentForTheApplicant() {
    when(repository.countInvalidVerificationDocumentMedia(eq("applicant"), any(String[].class))).thenReturn(1L);

    assertThatExceptionOfType(ApiException.class).isThrownBy(() ->
        service.submit("applicant", new VerificationService.SubmitVerificationInput("identity", List.of("other-media"), null)))
        .satisfies(error -> assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST));

    verifyNoInteractions(audit, profiles, notifications, analytics);
  }

  @Test
  void losingAConcurrentReviewDoesNotVerifyTheApplicantOrPublishSideEffects() {
    stubPendingReview();
    when(repository.reviewUpdate("request", "reviewer", "approved", "Checked evidence")).thenReturn(null);

    assertThatExceptionOfType(ApiException.class).isThrownBy(() ->
        service.review("request", "reviewer", new VerificationService.ReviewVerificationInput("approved", "Checked evidence")))
        .satisfies(error -> assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT));

    verifyNoInteractions(audit, profiles, notifications, users, analytics);
  }

  @Test
  void rejectionRecordsFeedbackAndNotifiesTheApplicantWithoutVerifyingThem() {
    stubPendingReview();
    var updated = mock(VerificationRequestRepository.VerificationRecordRow.class);
    when(updated.getStatus()).thenReturn("rejected");
    when(updated.getReviewerNotes()).thenReturn("Upload a current certificate.");
    when(repository.reviewUpdate("request", "reviewer", "rejected", "Upload a current certificate.")).thenReturn(updated);

    var result = service.review("request", "reviewer",
        new VerificationService.ReviewVerificationInput("rejected", "Upload a current certificate."));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.reviewerNotes()).isEqualTo("Upload a current certificate.");
    verify(audit).logEvent("reviewer", "applicant", "verification_request_rejected", null,
        Map.of("verificationRequestId", "request", "reviewerNotes", "Upload a current certificate."));
    verify(notifications).create(eq("applicant"), eq("verification_rejected"), eq("Verification not approved"),
        any(String.class), eq(Map.of("verificationRequestId", "request", "decision", "rejected")));
    verifyNoInteractions(profiles, users, analytics);
  }

  @Test
  void approvalVerifiesTheApplicantAndPublishesTheirAnalyticsIdentifier() {
    stubPendingReview();
    var updated = mock(VerificationRequestRepository.VerificationRecordRow.class);
    when(updated.getStatus()).thenReturn("approved");
    when(repository.reviewUpdate("request", "reviewer", "approved", null)).thenReturn(updated);
    when(users.getAnalyticsUserIdByUserId("applicant")).thenReturn(Optional.of("analytics-applicant"));

    assertThat(service.review("request", "reviewer", new VerificationService.ReviewVerificationInput("approved", null)).status())
        .isEqualTo("approved");

    verify(profiles).setVerified("applicant", true);
    verify(analytics).publishProviderVerified("analytics-applicant", "request");
    verify(notifications).create(eq("applicant"), eq("verification_approved"), eq("Your profile is verified"),
        any(String.class), eq(Map.of("verificationRequestId", "request", "decision", "approved")));
  }

  private void stubPendingReview() {
    var target = mock(VerificationRequestRepository.ReviewTargetRow.class);
    when(target.getUserId()).thenReturn("applicant");
    when(target.getStatus()).thenReturn("pending");
    when(repository.findReviewTarget("request")).thenReturn(target);
  }
}
