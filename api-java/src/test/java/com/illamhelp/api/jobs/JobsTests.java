package com.illamhelp.api.jobs;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.notifications.NotificationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JobsTests {
  @Test
  void controllerDelegatesActorAcrossJobActions() {
    JobsService service = mock(JobsService.class);
    JobsController controller = new JobsController(service);
    controller.list(jwt("u"), 2, "cursor");
    controller.accept(jwt("u"), "a");
    controller.start(jwt("u"), "j");
    controller.reject(jwt("u"), "a-reject", new JobsService.ReasonRequest("budget"));
    controller.revokeAssignment(jwt("u"), "j-revoke", new JobsService.ReasonRequest("availability"));
    controller.cancel(jwt("u"), "j", new JobsService.ReasonRequest("reschedule"));
    verify(service).list("u", 2, "cursor");
    verify(service).acceptApplication("a", "u");
    verify(service).startBooking("j", "u");
    verify(service).rejectApplication("a-reject", "u", "budget");
    verify(service).revokeAssignment("j-revoke", "u", "availability");
    verify(service).cancelBooking("j", "u", "reschedule");
  }

  @Test
  void createsAndPublicizesJobOwner() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    JobsSearchService search = mock(JobsSearchService.class);
    JobsService service = new JobsService(repository, audit, mock(NotificationService.class), search, properties());
    var request = new JobsService.CreateJobRequest("care", "Help needed", "Detailed job work", "Doha", "public", 25.28, 51.53);
    when(repository.createJob("owner", "care", "Help needed", "Detailed job work", "Doha", "public", 25.28, 51.53))
        .thenReturn(Map.of("id", "j", "seekerUserId", "owner"));
    when(repository.findPublicUserId("owner")).thenReturn("member_owner");

    assertThat(service.create("owner", request)).containsEntry("seekerUserId", "member_owner");
    verify(search).indexJob(Map.of("id", "j", "seekerUserId", "owner"));
    verify(audit).logEvent("owner", null, "job_created", null, Map.of("jobId", "j"));
  }

  @Test
  void passesFullDiscoveryFiltersToJpaFallback() {
    JobRepository repository = mock(JobRepository.class);
    JobsSearchService search = mock(JobsSearchService.class);
    when(search.searchJobIds(any())).thenReturn(new JobsSearchService.SearchResult(true, List.of("job-one", "job-two")));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), search, properties());
    when(repository.searchVisible(aryEq(new String[]{"job-one", "job-two"}), org.mockito.ArgumentMatchers.eq("actor"),
        org.mockito.ArgumentMatchers.eq("%plumber%"), org.mockito.ArgumentMatchers.eq("%care%"),
        org.mockito.ArgumentMatchers.eq("%doha%"), org.mockito.ArgumentMatchers.eq(4.2),
        org.mockito.ArgumentMatchers.eq("posted,accepted"), org.mockito.ArgumentMatchers.eq("public"),
        org.mockito.ArgumentMatchers.eq(25.28), org.mockito.ArgumentMatchers.eq(51.53),
        org.mockito.ArgumentMatchers.eq(10.0), org.mockito.ArgumentMatchers.eq(50))).thenReturn(List.of());

    assertThat(service.search("actor", Map.of(
        "q", "Plumber", "category", "CARE", "locationText", "Doha", "minSeekerRating", "4.2",
        "statuses", "posted,accepted", "visibility", "public", "latitude", "25.28",
        "longitude", "51.53", "radiusKm", "10", "limit", "50"))).isEmpty();

    verify(repository).searchVisible(aryEq(new String[]{"job-one", "job-two"}), org.mockito.ArgumentMatchers.eq("actor"),
        org.mockito.ArgumentMatchers.eq("%plumber%"), org.mockito.ArgumentMatchers.eq("%care%"),
        org.mockito.ArgumentMatchers.eq("%doha%"), org.mockito.ArgumentMatchers.eq(4.2),
        org.mockito.ArgumentMatchers.eq("posted,accepted"), org.mockito.ArgumentMatchers.eq("public"),
        org.mockito.ArgumentMatchers.eq(25.28), org.mockito.ArgumentMatchers.eq(51.53),
        org.mockito.ArgumentMatchers.eq(10.0), org.mockito.ArgumentMatchers.eq(50));
  }

  @Test
  void defaultsSearchToPostedJobsAndRejectsPartialCoordinates() {
    JobRepository repository = mock(JobRepository.class);
    JobsSearchService search = mock(JobsSearchService.class);
    when(search.searchJobIds(any())).thenReturn(new JobsSearchService.SearchResult(false, List.of()));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), search, properties());
    when(repository.searchVisible(null, "actor", null, null, null, null, "posted", null, null, null, null, 20))
        .thenReturn(List.of());

    assertThat(service.search("actor", Map.of())).isEmpty();
    verify(repository).searchVisible(null, "actor", null, null, null, null, "posted", null, null, null, null, 20);
    assertThatThrownBy(() -> service.search("actor", Map.of("latitude", "25.28")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Latitude, longitude, and radiusKm must be provided together for geo search");
  }

  @Test
  void returnsNoDatabaseRowsWhenAvailableIndexHasNoCandidates() {
    JobRepository repository = mock(JobRepository.class);
    JobsSearchService search = mock(JobsSearchService.class);
    when(search.searchJobIds(any())).thenReturn(new JobsSearchService.SearchResult(true, List.of()));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), search, properties());

    assertThat(service.search("actor", Map.of("q", "nothing nearby"))).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void rejectsJobCoordinatesUnlessLatitudeAndLongitudeArePaired() {
    JobRepository repository = mock(JobRepository.class);
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), mock(JobsSearchService.class), properties());
    var request = new JobsService.CreateJobRequest("care", "Help needed", "Detailed job work", "Doha", "public", 25.28, null);

    assertThatThrownBy(() -> service.create("owner", request))
        .isInstanceOf(ApiException.class)
        .hasMessage("locationLatitude and locationLongitude must be provided together");
    verify(repository, never()).createJob(any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void acceptsApplicationAndAssignsProvider() {
    JobRepository repository = mock(JobRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, mock(AuditService.class), notifications, mock(JobsSearchService.class), properties());
    when(repository.applicationWithJob("a")).thenReturn(Map.of("job_id", "j", "provider_user_id", "p",
        "seeker_user_id", "owner", "status", "applied", "job_status", "posted"));
    when(repository.acceptAuthorized("a", "owner")).thenReturn(Map.of("providerUserId", "p"));
    when(repository.findPublicUserId("p")).thenReturn("provider");

    assertThat(service.acceptApplication("a", "owner")).containsEntry("providerUserId", "provider");
    verify(repository).rejectOtherApplications("j", "a");
    verify(repository).acceptAuthorized("a", "owner");
    verify(notifications, org.mockito.Mockito.times(2)).create(any(), any(), any(), any(), any());
  }

  @Test
  void createsApplicationOnlyAfterEligibilityCheck() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    when(repository.applicationEligibility("provider", "job")).thenReturn(Map.of(
        "seeker_user_id", "owner", "status", "posted", "visibility", "public"));
    when(repository.applyAuthorized("provider", "job", "Available")).thenReturn(Map.of(
        "id", "application", "providerUserId", "provider"));
    when(repository.findPublicUserId("provider")).thenReturn("member_provider");

    assertThat(service.apply("provider", "job", new JobsService.ApplyJobRequest("Available")))
        .containsEntry("providerUserId", "member_provider");
    verify(audit).logEvent("provider", "owner", "job_application_submitted", null,
        Map.of("jobId", "job", "applicationId", "application"));
    verify(notifications).create("owner", "job_application_received", "New application received",
        "A provider applied to your job.", Map.of("jobId", "job", "applicationId", "application"));
  }

  @Test
  void rejectedApplicationEligibilityCreatesNoSideEffects() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());

    assertThatThrownBy(() -> service.apply("provider", "private-job", new JobsService.ApplyJobRequest("No access")))
        .isInstanceOf(ApiException.class)
        .hasMessage("Job not found");
    verify(repository, never()).applyAuthorized(any(), any(), any());
    verifyNoInteractions(audit, notifications);

    when(repository.applicationEligibility("owner", "job")).thenReturn(Map.of(
        "seeker_user_id", "owner", "status", "posted", "visibility", "public"));
    assertThatThrownBy(() -> service.apply("owner", "job", null))
        .isInstanceOf(ApiException.class)
        .hasMessage("Job owner cannot apply to their own job");
    verify(repository, never()).applyAuthorized(any(), any(), any());

    when(repository.applicationEligibility("provider", "closed-job")).thenReturn(Map.of(
        "seeker_user_id", "owner", "status", "closed", "visibility", "public"));
    assertThatThrownBy(() -> service.apply("provider", "closed-job", null))
        .isInstanceOf(ApiException.class)
        .hasMessage("Job is no longer open for applications");
    verify(repository, never()).applyAuthorized(any(), any(), any());
  }

  @Test
  void rejectsBookingStartFromIncorrectState() {
    JobRepository repository = mock(JobRepository.class);
    when(repository.jobState("j")).thenReturn(Map.of("status", "posted", "assigned_provider_user_id", "provider"));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), mock(JobsSearchService.class), properties());

    assertThatThrownBy(() -> service.startBooking("j", "provider")).isInstanceOf(ApiException.class);
  }

  @Test
  void concurrentAcceptanceFailureProducesNoNotifications() {
    JobRepository repository = mock(JobRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    AuditService audit = mock(AuditService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    when(repository.applicationWithJob("a")).thenReturn(Map.of("job_id", "j", "provider_user_id", "p",
        "seeker_user_id", "owner", "status", "applied", "job_status", "posted"));
    when(repository.acceptAuthorized("a", "owner")).thenReturn(Map.of());

    assertThatThrownBy(() -> service.acceptApplication("a", "owner"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Job is no longer open for acceptance");
    verifyNoInteractions(audit, notifications);
    verify(repository, never()).rejectOtherApplications(any(), any());
  }

  @Test
  void listUsesProjectedPublicIdentifiersWithoutLookupQueries() {
    JobRepository repository = mock(JobRepository.class);
    when(repository.listVisible("actor", null, null, 11)).thenReturn(List.of(Map.of(
        "id", "j", "createdAt", "2026-05-26T10:00:00Z", "seekerUserId", "internal",
        "seekerPublicUserId", "member", "assignedProviderPublicUserId", "provider")));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class),
        mock(JobsSearchService.class), properties());

    @SuppressWarnings("unchecked")
    Map<String, Object> item = (Map<String, Object>) ((List<?>) service.list("actor", 10, null).get("items")).getFirst();

    assertThat(item).containsEntry("seekerUserId", "member").containsEntry("assignedProviderUserId", "provider");
    verify(repository, never()).findPublicUserId(any());
  }

  @Test
  void listUsesDecodedCursorForStableSecondPageQueries() {
    JobRepository repository = mock(JobRepository.class);
    String cursor = String.valueOf(CursorPages.response(List.of(
        Map.of("id", "anchor", "createdAt", "2026-05-26T10:00:00Z"),
        Map.of("id", "older", "createdAt", "2026-05-26T09:00:00Z")), 1, "createdAt").get("nextCursor"));
    when(repository.listVisible("actor", "2026-05-26T10:00:00Z", "anchor", 2)).thenReturn(List.of());
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class),
        mock(JobsSearchService.class), properties());

    Map<String, Object> page = service.list("actor", 1, cursor);

    assertThat(page).containsEntry("limit", 1).containsEntry("nextCursor", null);
    assertThat((List<?>) page.get("items")).isEmpty();
    verify(repository).listVisible("actor", "2026-05-26T10:00:00Z", "anchor", 2);
  }

  @Test
  void rejectionRecordsReasonAndCannotRejectAnAcceptedApplication() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    JobsService service = new JobsService(repository, audit, mock(NotificationService.class),
        mock(JobsSearchService.class), properties());
    when(repository.applicationWithJob("a")).thenReturn(Map.of("job_id", "j", "provider_user_id", "p",
        "seeker_user_id", "owner", "status", "applied"));
    when(repository.setApplicationStatus("a", "rejected")).thenReturn(Map.of("providerUserId", "p"));
    when(repository.findPublicUserId("p")).thenReturn("provider");

    assertThat(service.rejectApplication("a", "owner", "  quote is too high  "))
        .containsEntry("providerUserId", "provider");
    verify(audit).logEvent("owner", "p", "job_application_rejected", null,
        Map.of("jobId", "j", "applicationId", "a", "reason", "quote is too high"));

    when(repository.applicationWithJob("accepted")).thenReturn(Map.of("job_id", "j", "provider_user_id", "p",
        "seeker_user_id", "owner", "status", "accepted"));
    assertThatThrownBy(() -> service.rejectApplication("accepted", "owner", null))
        .isInstanceOf(ApiException.class)
        .hasMessage("Accepted application cannot be rejected directly");
  }

  @Test
  void revokeAssignmentHonorsConfiguredWindowAndRecordsReason() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    when(repository.jobState("j")).thenReturn(Map.of("status", "accepted", "seeker_user_id", "owner",
        "assigned_provider_user_id", "provider", "accepted_application_id", "application"));
    when(repository.assignmentWithinRevokeWindow("application", 30)).thenReturn(true);
    when(repository.reopenJob("j")).thenReturn(Map.of("seekerUserId", "owner"));
    when(repository.findPublicUserId("owner")).thenReturn("seeker");

    assertThat(service.revokeAssignment("j", "owner", " another provider "))
        .containsEntry("seekerUserId", "seeker");
    verify(repository).updateAcceptedApplicationStatus("application", "rejected");
    verify(audit).logEvent("owner", "provider", "job_assignment_revoked", null,
        Map.of("jobId", "j", "revokedApplicationId", "application", "reason", "another provider"));
    verify(notifications, org.mockito.Mockito.times(2)).create(any(), any(), any(), any(), any());

    when(repository.assignmentWithinRevokeWindow("application", 30)).thenReturn(false);
    assertThatThrownBy(() -> service.revokeAssignment("j", "owner", null))
        .isInstanceOf(ApiException.class)
        .hasMessage("Assignment can be revoked only within 30 minutes of approval");
  }

  @Test
  void bookingLifecycleTransitionsNotifyAndAuditTheParticipants() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    when(repository.jobState("j"))
        .thenReturn(Map.of("status", "accepted", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "in_progress", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "in_progress", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "completed", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "completed", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "payment_done", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "payment_received", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"))
        .thenReturn(Map.of("status", "payment_received", "seeker_user_id", "owner", "assigned_provider_user_id", "provider"));
    when(repository.transitionJobStatus(any(), any(), any())).thenAnswer(invocation ->
        Map.of("id", "j", "status", invocation.getArgument(2), "seekerPublicUserId", "owner",
            "assignedProviderPublicUserId", "provider"));

    assertThat(service.startBooking("j", "provider")).containsEntry("status", "in_progress");
    assertThat(service.completeBooking("j", "owner")).containsEntry("status", "completed");
    assertThat(service.markPaymentDone("j", "owner")).containsEntry("status", "payment_done");
    assertThat(service.markPaymentReceived("j", "provider")).containsEntry("status", "payment_received");
    assertThat(service.closeBooking("j", "owner")).containsEntry("status", "closed");

    verify(repository).transitionJobStatus("j", "accepted", "in_progress");
    verify(repository).transitionJobStatus("j", "in_progress", "completed");
    verify(repository).transitionJobStatus("j", "completed", "payment_done");
    verify(repository).transitionJobStatus("j", "payment_done", "payment_received");
    verify(repository).transitionJobStatus("j", "payment_received", "closed");
    verify(notifications).create("owner", "job_booking_started", "Booking started",
        "Your assigned provider started the booking.", Map.of("jobId", "j"));
    verify(audit).logEvent("provider", "owner", "booking_payment_received", null, Map.of("jobId", "j"));
  }

  @Test
  void providerCanCancelAssignedBookingAndOwnerIsNotified() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    when(repository.jobState("j")).thenReturn(Map.of("status", "in_progress", "seeker_user_id", "owner",
        "assigned_provider_user_id", "provider", "accepted_application_id", "application"));
    when(repository.transitionJobStatus("j", "in_progress", "cancelled")).thenReturn(
        Map.of("status", "cancelled", "seekerPublicUserId", "owner", "assignedProviderPublicUserId", "provider"));

    assertThat(service.cancelBooking("j", "provider", "Unable to attend")).containsEntry("status", "cancelled");

    verify(repository).updateAcceptedApplicationStatus("application", "withdrawn");
    verify(audit).logEvent("provider", "owner", "booking_cancelled", null,
        Map.of("jobId", "j", "acceptedApplicationId", "application", "reason", "Unable to attend"));
    verify(notifications).create("owner", "job_booking_cancelled", "Booking cancelled",
        "A booking was cancelled.", Map.of("jobId", "j"));
  }

  @Test
  void ownerCanCancelUnassignedPostedJobWithoutInvalidAuditTarget() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    NotificationService notifications = mock(NotificationService.class);
    JobsService service = new JobsService(repository, audit, notifications, mock(JobsSearchService.class), properties());
    Map<String, Object> posted = new java.util.HashMap<>();
    posted.put("status", "posted");
    posted.put("seeker_user_id", "owner");
    posted.put("assigned_provider_user_id", null);
    posted.put("accepted_application_id", null);
    when(repository.jobState("j")).thenReturn(posted);
    when(repository.transitionJobStatus("j", "posted", "cancelled")).thenReturn(
        Map.of("status", "cancelled", "seekerPublicUserId", "owner"));

    assertThat(service.cancelBooking("j", "owner", "Schedule changed")).containsEntry("status", "cancelled");

    Map<String, Object> metadata = new java.util.LinkedHashMap<>();
    metadata.put("jobId", "j");
    metadata.put("acceptedApplicationId", null);
    metadata.put("reason", "Schedule changed");
    verify(audit).logEvent("owner", null, "booking_cancelled", null, metadata);
    verifyNoInteractions(notifications);
  }

  @Test
  void withdrawalUpdatesPendingApplicationAndRejectsWrongActor() {
    JobRepository repository = mock(JobRepository.class);
    AuditService audit = mock(AuditService.class);
    JobsService service = new JobsService(repository, audit, mock(NotificationService.class),
        mock(JobsSearchService.class), properties());
    when(repository.applicationWithJob("a")).thenReturn(Map.of("job_id", "j", "provider_user_id", "provider",
        "seeker_user_id", "owner", "status", "applied"));
    when(repository.setApplicationStatus("a", "withdrawn")).thenReturn(Map.of(
        "providerPublicUserId", "member_provider", "status", "withdrawn"));

    assertThat(service.withdrawApplication("a", "provider"))
        .containsEntry("providerUserId", "member_provider").containsEntry("status", "withdrawn");
    verify(audit).logEvent("provider", "owner", "job_application_withdrawn", null,
        Map.of("jobId", "j", "applicationId", "a"));

    assertThatThrownBy(() -> service.withdrawApplication("a", "other"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Only applicant can withdraw this application");
  }
}
