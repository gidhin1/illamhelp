package com.illamhelp.api.jobs;

import com.illamhelp.api.common.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class JobsController {
  private final JobsService jobsService;

  public JobsController(JobsService jobsService) {
    this.jobsService = jobsService;
  }

  @GetMapping("/jobs")
  public Map<String, Object> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) String cursor) {
    return jobsService.list(CurrentUser.fromJwt(jwt).userId(), limit, cursor);
  }

  @GetMapping("/jobs/search")
  public List<Map<String, Object>> search(@AuthenticationPrincipal Jwt jwt, @RequestParam Map<String, Object> query) {
    return jobsService.search(CurrentUser.fromJwt(jwt).userId(), query);
  }

  @PostMapping("/jobs")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody JobsService.CreateJobRequest request) {
    return jobsService.create(CurrentUser.fromJwt(jwt).userId(), request);
  }

  @PostMapping("/jobs/{id}/apply")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> apply(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
      @Valid @RequestBody(required = false) JobsService.ApplyJobRequest request) {
    return jobsService.apply(CurrentUser.fromJwt(jwt).userId(), id, request);
  }

  @GetMapping("/jobs/{id}/applications")
  public List<Map<String, Object>> listApplications(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.listApplications(id, CurrentUser.fromJwt(jwt).userId());
  }

  @GetMapping("/jobs/applications/mine")
  public List<Map<String, Object>> listMyApplications(@AuthenticationPrincipal Jwt jwt) {
    return jobsService.listMyApplications(CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/applications/{applicationId}/accept")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> accept(@AuthenticationPrincipal Jwt jwt, @PathVariable String applicationId) {
    return jobsService.acceptApplication(applicationId, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/applications/{applicationId}/reject")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> reject(@AuthenticationPrincipal Jwt jwt, @PathVariable String applicationId,
      @Valid @RequestBody(required = false) JobsService.ReasonRequest request) {
    return jobsService.rejectApplication(applicationId, CurrentUser.fromJwt(jwt).userId(), reason(request));
  }

  @PostMapping("/jobs/applications/{applicationId}/withdraw")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable String applicationId) {
    return jobsService.withdrawApplication(applicationId, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/start")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> start(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.startBooking(id, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/complete")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> complete(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.completeBooking(id, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/payment-done")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> paymentDone(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.markPaymentDone(id, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/payment-received")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> paymentReceived(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.markPaymentReceived(id, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/close")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> close(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return jobsService.closeBooking(id, CurrentUser.fromJwt(jwt).userId());
  }

  @PostMapping("/jobs/{id}/booking/revoke-assignment")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> revokeAssignment(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
      @Valid @RequestBody(required = false) JobsService.ReasonRequest request) {
    return jobsService.revokeAssignment(id, CurrentUser.fromJwt(jwt).userId(), reason(request));
  }

  @PostMapping("/jobs/{id}/booking/cancel")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
      @Valid @RequestBody(required = false) JobsService.ReasonRequest request) {
    return jobsService.cancelBooking(id, CurrentUser.fromJwt(jwt).userId(), reason(request));
  }

  private String reason(JobsService.ReasonRequest request) {
    return request == null ? null : request.reason();
  }
}
