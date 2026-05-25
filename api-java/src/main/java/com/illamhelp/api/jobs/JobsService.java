package com.illamhelp.api.jobs;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.notifications.NotificationService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JobsService {
  private static final Set<String> SEARCH_STATUSES = Set.of(
      "posted", "accepted", "in_progress", "completed", "payment_done", "payment_received", "closed", "cancelled");
  private static final Set<String> SEARCH_VISIBILITIES = Set.of("public", "connections_only");
  private final JobRepository jobRepository;
  private final AuditService auditService;
  private final NotificationService notificationService;
  private final JobsSearchService jobsSearchService;
  private final int assignmentRevokeWindowMinutes;

  public JobsService(JobRepository jobRepository, AuditService auditService, NotificationService notificationService,
      JobsSearchService jobsSearchService, AppProperties properties) {
    this.jobRepository = jobRepository;
    this.auditService = auditService;
    this.notificationService = notificationService;
    this.jobsSearchService = jobsSearchService;
    this.assignmentRevokeWindowMinutes = properties.jobAssignmentRevokeWindowMinutes();
  }

  public Map<String, Object> list(String userId, Integer limit, Integer offset) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    int safeOffset = offset == null ? 0 : Math.max(0, offset);
    List<Map<String, Object>> items = jobRepository.listVisible(userId, safeLimit, safeOffset).stream().map(this::publicizeJob).toList();
    return Map.of("items", items, "total", jobRepository.countVisible(userId), "limit", safeLimit, "offset", safeOffset);
  }

  public List<Map<String, Object>> search(String userId, Map<String, Object> query) {
    String rawQuery = searchText(query.get("q"), 160, "q");
    String rawCategory = searchText(query.get("category"), 64, "category");
    String rawLocationText = searchText(query.get("locationText"), 160, "locationText");
    String q = likePattern(rawQuery);
    String category = likePattern(rawCategory);
    String locationText = likePattern(rawLocationText);
    Double minSeekerRating = decimal(query.get("minSeekerRating"), "minSeekerRating", 0, 5);
    String statuses = statuses(query.get("statuses"));
    String visibility = optionalText(query.get("visibility"));
    if (visibility != null && !SEARCH_VISIBILITIES.contains(visibility)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported job visibility: " + visibility);
    }
    Double latitude = decimal(query.get("latitude"), "latitude", -90, 90);
    Double longitude = decimal(query.get("longitude"), "longitude", -180, 180);
    Double radiusKm = decimal(query.get("radiusKm"), "radiusKm", 1, 100);
    if ((latitude != null || longitude != null || radiusKm != null)
        && (latitude == null || longitude == null || radiusKm == null)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Latitude, longitude, and radiusKm must be provided together for geo search");
    }
    int limit = integer(query.get("limit"), 20, 1, 50, "limit");
    String effectiveStatuses = statuses == null ? "posted" : statuses;
    JobsSearchService.SearchResult indexed = jobsSearchService.searchJobIds(new JobsSearchService.SearchCriteria(
        rawQuery, rawCategory, rawLocationText, minSeekerRating, Arrays.asList(effectiveStatuses.split(",")),
        latitude, longitude, radiusKm, limit));
    if (indexed.available() && indexed.ids().isEmpty()) {
      return List.of();
    }
    String preferredIds = indexed.available() ? String.join(",", indexed.ids()) : null;
    return jobRepository.searchVisible(preferredIds, userId, q, category, locationText, minSeekerRating,
        effectiveStatuses, visibility, latitude, longitude, radiusKm, limit)
        .stream().map(this::publicizeJob).toList();
  }

  @Transactional
  public Map<String, Object> create(String userId, CreateJobRequest request) {
    if ((request.locationLatitude() == null) != (request.locationLongitude() == null)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "locationLatitude and locationLongitude must be provided together");
    }
    Map<String, Object> job = jobRepository.createJob(userId, request.category(), request.title(), request.description(),
        request.locationText(), request.visibility() == null ? "public" : request.visibility(),
        request.locationLatitude(), request.locationLongitude());
    jobsSearchService.indexJob(job);
    auditService.logEvent(userId, null, "job_created", null, Map.of("jobId", String.valueOf(job.get("id"))));
    return publicizeJob(job);
  }

  @Transactional
  public Map<String, Object> apply(String userId, String jobId, ApplyJobRequest request) {
    Map<String, Object> application = jobRepository.apply(userId, jobId, request == null ? null : request.message());
    Map<String, Object> job = job(jobId);
    auditService.logEvent(userId, String.valueOf(job.get("seeker_user_id")), "job_application_submitted", null,
        Map.of("jobId", jobId, "applicationId", String.valueOf(application.get("id"))));
    notificationService.create(String.valueOf(job.get("seeker_user_id")), "job_application_received", "New application received",
        "A provider applied to your job.", Map.of("jobId", jobId, "applicationId", String.valueOf(application.get("id"))));
    return publicizeApplication(application);
  }

  public List<Map<String, Object>> listApplications(String jobId, String actorUserId) {
    return jobRepository.listApplications(jobId, actorUserId).stream().map(this::publicizeApplication).toList();
  }

  public List<Map<String, Object>> listMyApplications(String userId) {
    return jobRepository.listMyApplications(userId).stream().map(this::publicizeApplication).toList();
  }

  @Transactional
  public Map<String, Object> acceptApplication(String applicationId, String seekerUserId) {
    Map<String, Object> application = applicationWithJob(applicationId);
    if (!seekerUserId.equals(String.valueOf(application.get("seeker_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only job owner can accept applications");
    }
    if (!List.of("applied", "shortlisted").contains(String.valueOf(application.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only active applications can be accepted");
    }
    if (!"posted".equals(String.valueOf(application.get("job_status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Job is no longer open for acceptance");
    }

    String jobId = String.valueOf(application.get("job_id"));
    String providerUserId = String.valueOf(application.get("provider_user_id"));
    Map<String, Object> accepted = jobRepository.setApplicationStatus(applicationId, "accepted");
    jobRepository.rejectOtherApplications(jobId, applicationId);
    jobRepository.assignProvider(jobId, providerUserId, applicationId);
    jobsSearchService.indexJob(jobRepository.findIndexableJob(jobId));
    auditService.logEvent(seekerUserId, String.valueOf(application.get("provider_user_id")), "job_application_accepted", null,
        Map.of("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId));
    notificationService.create(String.valueOf(application.get("provider_user_id")), "job_application_accepted", "Application accepted!",
        "Your job application has been accepted.", Map.of("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId));
    notificationService.create(seekerUserId, "job_application_accepted", "Provider assigned",
        "You assigned a provider. Booking can start now.", Map.of("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId));
    return publicizeApplication(accepted);
  }

  @Transactional
  public Map<String, Object> rejectApplication(String applicationId, String seekerUserId, String reason) {
    Map<String, Object> application = applicationWithJob(applicationId);
    if (!seekerUserId.equals(String.valueOf(application.get("seeker_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only job owner can reject applications");
    }
    String status = String.valueOf(application.get("status"));
    if ("rejected".equals(status)) {
      return publicizeApplication(jobRepository.applicationById(applicationId));
    }
    if ("withdrawn".equals(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot reject an application already withdrawn");
    }
    if ("accepted".equals(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accepted application cannot be rejected directly");
    }
    Map<String, Object> updated = setApplicationStatus(applicationId, "rejected");
    auditService.logEvent(seekerUserId, String.valueOf(application.get("provider_user_id")), "job_application_rejected", null,
        eventMetadata("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId,
            "reason", normalizedReason(reason)));
    notificationService.create(String.valueOf(application.get("provider_user_id")), "job_application_rejected", "Application rejected",
        "Your job application was not selected.", Map.of("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId));
    return publicizeApplication(updated);
  }

  @Transactional
  public Map<String, Object> withdrawApplication(String applicationId, String providerUserId) {
    Map<String, Object> application = applicationWithJob(applicationId);
    if (!providerUserId.equals(String.valueOf(application.get("provider_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only applicant can withdraw this application");
    }
    String status = String.valueOf(application.get("status"));
    if ("withdrawn".equals(status)) {
      return publicizeApplication(jobRepository.applicationById(applicationId));
    }
    if ("accepted".equals(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Accepted application cannot be withdrawn directly. Use booking cancel.");
    }
    if ("rejected".equals(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Rejected application cannot be withdrawn");
    }
    Map<String, Object> updated = setApplicationStatus(applicationId, "withdrawn");
    auditService.logEvent(providerUserId, String.valueOf(application.get("seeker_user_id")), "job_application_withdrawn", null,
        Map.of("jobId", String.valueOf(application.get("job_id")), "applicationId", applicationId));
    return publicizeApplication(updated);
  }

  private Map<String, Object> setApplicationStatus(String applicationId, String status) {
    return jobRepository.setApplicationStatus(applicationId, status);
  }

  @Transactional
  public Map<String, Object> startBooking(String jobId, String actorUserId) {
    Map<String, Object> job = job(jobId);
    if (!"accepted".equals(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only accepted jobs can be started");
    }
    if (!actorUserId.equals(String.valueOf(job.get("assigned_provider_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only assigned provider can start this booking");
    }
    Map<String, Object> updated = setJobStatus(jobId, "in_progress");
    auditService.logEvent(actorUserId, String.valueOf(job.get("seeker_user_id")), "booking_started", null, Map.of("jobId", jobId));
    notificationService.create(String.valueOf(job.get("seeker_user_id")), "job_booking_started", "Booking started",
        "Your assigned provider started the booking.", Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  public Map<String, Object> completeBooking(String jobId, String actorUserId) {
    Map<String, Object> updated = ownerTransition(jobId, actorUserId, "in_progress", "completed", "Only in-progress jobs can be completed", "Only job owner can complete this booking");
    auditService.logEvent(actorUserId, String.valueOf(job(jobId).get("assigned_provider_user_id")), "booking_completed", null, Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  public Map<String, Object> markPaymentDone(String jobId, String actorUserId) {
    Map<String, Object> updated = ownerTransition(jobId, actorUserId, "completed", "payment_done", "Payment can be marked done only after job completion", "Only job owner can mark payment done");
    auditService.logEvent(actorUserId, String.valueOf(job(jobId).get("assigned_provider_user_id")), "booking_payment_marked_done", null, Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  public Map<String, Object> markPaymentReceived(String jobId, String actorUserId) {
    Map<String, Object> job = job(jobId);
    if (!"payment_done".equals(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Payment can be received only after owner marks payment done");
    }
    if (!actorUserId.equals(String.valueOf(job.get("assigned_provider_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only assigned provider can mark payment received");
    }
    Map<String, Object> updated = setJobStatus(jobId, "payment_received");
    auditService.logEvent(actorUserId, String.valueOf(job.get("seeker_user_id")), "booking_payment_received", null, Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  public Map<String, Object> closeBooking(String jobId, String actorUserId) {
    Map<String, Object> updated = ownerTransition(jobId, actorUserId, "payment_received", "closed", "Job can be closed only after payment is received", "Only job owner can close this booking");
    auditService.logEvent(actorUserId, String.valueOf(job(jobId).get("assigned_provider_user_id")), "booking_closed", null, Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  @Transactional
  public Map<String, Object> revokeAssignment(String jobId, String actorUserId, String reason) {
    Map<String, Object> job = job(jobId);
    if (!"accepted".equals(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Assignment can be revoked only while the job is accepted and before work starts");
    }
    if (!actorUserId.equals(String.valueOf(job.get("seeker_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only job owner can revoke assignment");
    }
    if (job.get("accepted_application_id") == null || job.get("assigned_provider_user_id") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "No active assignment found for this job");
    }
    String applicationId = String.valueOf(job.get("accepted_application_id"));
    if (!jobRepository.assignmentWithinRevokeWindow(applicationId, assignmentRevokeWindowMinutes)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Assignment can be revoked only within " + assignmentRevokeWindowMinutes + " minutes of approval");
    }
    jobRepository.updateAcceptedApplicationStatus(applicationId, "rejected");
    Map<String, Object> updated = jobRepository.reopenJob(jobId);
    jobsSearchService.indexJob(updated);
    auditService.logEvent(actorUserId, String.valueOf(job.get("assigned_provider_user_id")), "job_assignment_revoked", null,
        eventMetadata("jobId", jobId, "revokedApplicationId", applicationId, "reason", normalizedReason(reason)));
    notificationService.create(String.valueOf(job.get("assigned_provider_user_id")), "job_application_rejected", "Assignment revoked",
        "A job assignment was revoked before work started.", Map.of("jobId", jobId));
    notificationService.create(actorUserId, "job_application_accepted", "Assignment revoked",
        "Assignment was revoked. You can pick another applicant.", Map.of("jobId", jobId));
    return publicizeJob(updated);
  }

  @Transactional
  public Map<String, Object> cancelBooking(String jobId, String actorUserId, String reason) {
    Map<String, Object> job = job(jobId);
    if ("completed".equals(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Completed booking cannot be cancelled");
    }
    if ("cancelled".equals(String.valueOf(job.get("status")))) {
      return publicizeJob(jobRepository.findIndexableJob(jobId));
    }
    if (!List.of("posted", "accepted", "in_progress").contains(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Job cannot be cancelled from current state");
    }
    boolean canCancel = actorUserId.equals(String.valueOf(job.get("seeker_user_id")))
        || actorUserId.equals(String.valueOf(job.get("assigned_provider_user_id")));
    if (!canCancel) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Actor is not allowed to cancel this booking");
    }
    if (job.get("accepted_application_id") != null) {
      String nextStatus = actorUserId.equals(String.valueOf(job.get("assigned_provider_user_id"))) ? "withdrawn" : "rejected";
      jobRepository.updateAcceptedApplicationStatus(String.valueOf(job.get("accepted_application_id")), nextStatus);
    }
    Map<String, Object> updated = setJobStatus(jobId, "cancelled");
    String target = actorUserId.equals(String.valueOf(job.get("seeker_user_id")))
        ? String.valueOf(job.get("assigned_provider_user_id"))
        : String.valueOf(job.get("seeker_user_id"));
    auditService.logEvent(actorUserId, target, "booking_cancelled", null,
        eventMetadata("jobId", jobId, "acceptedApplicationId", job.get("accepted_application_id"),
            "reason", normalizedReason(reason)));
    if (target != null && !"null".equals(target)) {
      notificationService.create(target, "job_booking_cancelled", "Booking cancelled",
          "A booking was cancelled.", Map.of("jobId", jobId));
    }
    return publicizeJob(updated);
  }

  private Map<String, Object> ownerTransition(String jobId, String actorUserId, String fromStatus, String toStatus, String stateMessage, String authMessage) {
    Map<String, Object> job = job(jobId);
    if (!fromStatus.equals(String.valueOf(job.get("status")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, stateMessage);
    }
    if (!actorUserId.equals(String.valueOf(job.get("seeker_user_id")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, authMessage);
    }
    return setJobStatus(jobId, toStatus);
  }

  private Map<String, Object> setJobStatus(String jobId, String status) {
    Map<String, Object> updated = jobRepository.setJobStatus(jobId, status);
    jobsSearchService.indexJob(updated);
    return updated;
  }

  private Map<String, Object> job(String jobId) {
    return jobRepository.jobState(jobId);
  }

  private Map<String, Object> applicationWithJob(String applicationId) {
    return jobRepository.applicationWithJob(applicationId);
  }

  private String normalizedReason(String reason) {
    return reason == null || reason.isBlank() ? null : reason.trim();
  }

  private Map<String, Object> eventMetadata(Object... entries) {
    Map<String, Object> metadata = new LinkedHashMap<>();
    for (int index = 0; index < entries.length; index += 2) {
      metadata.put(String.valueOf(entries[index]), entries[index + 1]);
    }
    return metadata;
  }

  private Map<String, Object> publicizeJob(Map<String, Object> job) {
    Map<String, Object> publicJob = new LinkedHashMap<>(job);
    publicJob.put("seekerUserId", publicUserId(job.get("seekerUserId")));
    publicJob.put("assignedProviderUserId", publicUserId(job.get("assignedProviderUserId")));
    return publicJob;
  }

  private Map<String, Object> publicizeApplication(Map<String, Object> application) {
    Map<String, Object> publicApplication = new LinkedHashMap<>(application);
    publicApplication.put("providerUserId", publicUserId(application.get("providerUserId")));
    return publicApplication;
  }

  private String publicUserId(Object userId) {
    if (userId == null) {
      return null;
    }
    return jobRepository.findPublicUserId(String.valueOf(userId));
  }

  private String searchText(Object value, int maxLength, String field) {
    String normalized = optionalText(value);
    if (normalized == null) {
      return null;
    }
    if (normalized.length() > maxLength) {
      throw new ApiException(HttpStatus.BAD_REQUEST, field + " is too long");
    }
    return normalized;
  }

  private String likePattern(String value) {
    return value == null ? null : "%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
  }

  private String optionalText(Object value) {
    if (value == null) {
      return null;
    }
    String normalized = String.valueOf(value).trim();
    return normalized.isEmpty() ? null : normalized.toLowerCase();
  }

  private String statuses(Object value) {
    String normalized = optionalText(value);
    if (normalized == null) {
      return null;
    }
    List<String> statuses = Arrays.stream(normalized.split(","))
        .map(String::trim)
        .filter(item -> !item.isBlank())
        .toList();
    String invalid = statuses.stream().filter(status -> !SEARCH_STATUSES.contains(status)).findFirst().orElse(null);
    if (invalid != null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported job status: " + invalid);
    }
    return statuses.isEmpty() ? null : String.join(",", statuses);
  }

  private Double decimal(Object value, String field, double minimum, double maximum) {
    String normalized = optionalText(value);
    if (normalized == null) {
      return null;
    }
    try {
      double parsed = Double.parseDouble(normalized);
      if (!Double.isFinite(parsed) || parsed < minimum || parsed > maximum) {
        throw new ApiException(HttpStatus.BAD_REQUEST, field + " is outside the allowed range");
      }
      return parsed;
    } catch (NumberFormatException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, field + " must be a number");
    }
  }

  private int integer(Object value, int fallback, int minimum, int maximum, String field) {
    String normalized = optionalText(value);
    if (normalized == null) {
      return fallback;
    }
    try {
      int parsed = Integer.parseInt(normalized);
      if (parsed < minimum || parsed > maximum) {
        throw new ApiException(HttpStatus.BAD_REQUEST, field + " is outside the allowed range");
      }
      return parsed;
    } catch (NumberFormatException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, field + " must be an integer");
    }
  }

  public record CreateJobRequest(
      @NotBlank @Size(min = 2, max = 64) String category,
      @NotBlank @Size(min = 4, max = 120) String title,
      @NotBlank @Size(min = 10, max = 1000) String description,
      @NotBlank @Size(min = 2, max = 160) String locationText,
      @NotBlank @Pattern(regexp = "public|connections_only") String visibility,
      @DecimalMin("-90.0") @DecimalMax("90.0") Double locationLatitude,
      @DecimalMin("-180.0") @DecimalMax("180.0") Double locationLongitude) {
  }

  public record ApplyJobRequest(@Size(min = 4, max = 500) String message) {
  }

  public record ReasonRequest(@Size(min = 2, max = 240) String reason) {
  }
}
