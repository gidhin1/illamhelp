package com.illamhelp.api.jobs;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JobsTests {
  @Test
  void controllerDelegatesActorAcrossJobActions() {
    JobsService service = mock(JobsService.class);
    JobsController controller = new JobsController(service);
    controller.list(jwt("u"), 2, 0);
    controller.accept(jwt("u"), "a");
    controller.start(jwt("u"), "j");
    controller.reject(jwt("u"), "a-reject", new JobsService.ReasonRequest("budget"));
    controller.revokeAssignment(jwt("u"), "j-revoke", new JobsService.ReasonRequest("availability"));
    controller.cancel(jwt("u"), "j", new JobsService.ReasonRequest("reschedule"));
    verify(service).list("u", 2, 0);
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
    when(repository.searchVisible("job-one,job-two", "actor", "%plumber%", "%care%", "%doha%", 4.2,
        "posted,accepted", "public", 25.28, 51.53, 10.0, 50)).thenReturn(List.of());

    assertThat(service.search("actor", Map.of(
        "q", "Plumber", "category", "CARE", "locationText", "Doha", "minSeekerRating", "4.2",
        "statuses", "posted,accepted", "visibility", "public", "latitude", "25.28",
        "longitude", "51.53", "radiusKm", "10", "limit", "50"))).isEmpty();

    verify(repository).searchVisible("job-one,job-two", "actor", "%plumber%", "%care%", "%doha%", 4.2,
        "posted,accepted", "public", 25.28, 51.53, 10.0, 50);
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
    when(repository.setApplicationStatus("a", "accepted")).thenReturn(Map.of("providerUserId", "p"));
    when(repository.findPublicUserId("p")).thenReturn("provider");

    assertThat(service.acceptApplication("a", "owner")).containsEntry("providerUserId", "provider");
    verify(repository).rejectOtherApplications("j", "a");
    verify(repository).assignProvider("j", "p", "a");
    verify(notifications, org.mockito.Mockito.times(2)).create(any(), any(), any(), any(), any());
  }

  @Test
  void rejectsBookingStartFromIncorrectState() {
    JobRepository repository = mock(JobRepository.class);
    when(repository.jobState("j")).thenReturn(Map.of("status", "posted", "assigned_provider_user_id", "provider"));
    JobsService service = new JobsService(repository, mock(AuditService.class), mock(NotificationService.class), mock(JobsSearchService.class), properties());

    assertThatThrownBy(() -> service.startBooking("j", "provider")).isInstanceOf(ApiException.class);
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
}
