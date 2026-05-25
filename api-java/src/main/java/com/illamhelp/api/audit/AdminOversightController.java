package com.illamhelp.api.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.CurrentUser;
import com.illamhelp.api.profiles.ProfilesService;
import com.illamhelp.api.profiles.VerificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("hasAnyRole('admin','support')")
public class AdminOversightController {
  private static final String UUID_PATTERN =
      "(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

  private final AuditEventRepository auditEventRepository;
  private final ProfilesService profilesService;
  private final VerificationService verificationService;
  private final ObjectMapper objectMapper;

  public AdminOversightController(AuditEventRepository auditEventRepository, ProfilesService profilesService,
      VerificationService verificationService, ObjectMapper objectMapper) {
    this.auditEventRepository = auditEventRepository;
    this.profilesService = profilesService;
    this.verificationService = verificationService;
    this.objectMapper = objectMapper;
  }

  @GetMapping("/admin/oversight/timeline")
  public Map<String, Object> timeline(@Valid @ModelAttribute TimelineRequest request) {
    String memberId = request.memberId();
    int safeLimit = request.limit() == null ? 50 : request.limit();
    Map<String, Object> member = memberId.matches(UUID_PATTERN)
        ? auditEventRepository.memberById(memberId)
        : auditEventRepository.memberByUsername(memberId);
    String userId = String.valueOf(member.get("userId"));
    List<Map<String, Object>> accessRequests = auditEventRepository.accessRequests(userId, safeLimit);
    List<Map<String, Object>> consentGrants = auditEventRepository.consentGrants(userId, safeLimit);
    List<Map<String, Object>> auditEvents = auditEventRepository.timelineEvents(userId, safeLimit).stream()
        .map(this::normalizeMetadata).toList();
    return Map.of("member", member, "accessRequests", accessRequests, "consentGrants", consentGrants, "auditEvents", auditEvents);
  }

  @PatchMapping("/admin/oversight/members/{userId}/verify")
  public Map<String, Object> verifyMember(@PathVariable String userId, @Valid @RequestBody VerifyMemberRequest request) {
    return profilesService.setVerified(userId, request.verified());
  }

  @GetMapping("/admin/oversight/verifications")
  public Map<String, Object> verifications(@Valid @ModelAttribute VerificationListRequest request) {
    return verificationService.listForAdmin(request.status(), request.limit(), request.offset());
  }

  @PostMapping("/admin/oversight/verifications/{id}/review")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> reviewVerification(
      @PathVariable String id,
      @Valid @RequestBody VerificationReviewRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("decision", request.decision());
    body.put("notes", request.notes());
    return verificationService.review(id, CurrentUser.fromJwt(jwt).userId(), body);
  }

  public record TimelineRequest(@NotBlank String memberId, @Min(1) @Max(200) Integer limit) {
  }

  public record VerifyMemberRequest(@NotNull Boolean verified) {
  }

  public record VerificationListRequest(
      @Pattern(regexp = "pending|under_review|approved|rejected") String status,
      @Min(1) @Max(100) Integer limit,
      @Min(0) Integer offset) {
  }

  public record VerificationReviewRequest(
      @NotBlank @Pattern(regexp = "approved|rejected") String decision,
      @Size(max = 1000) String notes) {
  }

  private Map<String, Object> normalizeMetadata(Map<String, Object> row) {
    if (row.get("metadata") == null || row.get("metadata") instanceof Map<?, ?>) {
      return row;
    }
    Map<String, Object> normalized = new LinkedHashMap<>(row);
    try {
      normalized.put("metadata", objectMapper.readValue(String.valueOf(row.get("metadata")), Map.class));
    } catch (JsonProcessingException exception) {
      normalized.put("metadata", Map.of());
    }
    return normalized;
  }
}
