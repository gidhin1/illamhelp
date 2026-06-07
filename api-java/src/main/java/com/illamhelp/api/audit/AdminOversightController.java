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
  public TimelineResponse timeline(@Valid @ModelAttribute TimelineRequest request) {
    String memberId = request.memberId();
    int safeLimit = request.limit() == null ? 50 : request.limit();
    Map<String, Object> member = memberId.matches(UUID_PATTERN)
        ? auditEventRepository.memberById(memberId)
        : auditEventRepository.memberByUsername(memberId);
    String userId = String.valueOf(member.get("userId"));
    List<AccessRequestRecord> accessRequests = auditEventRepository.accessRequests(userId, safeLimit).stream()
        .map(AdminOversightController::accessRequestRecord).toList();
    List<ConsentGrantRecord> consentGrants = auditEventRepository.consentGrants(userId, safeLimit).stream()
        .map(AdminOversightController::consentGrantRecord).toList();
    List<AuditTimelineEvent> auditEvents = auditEventRepository.timelineEvents(userId, safeLimit).stream()
        .map(this::normalizeMetadata)
        .map(AdminOversightController::auditTimelineEvent)
        .toList();
    return new TimelineResponse(memberRecord(member), accessRequests, consentGrants, auditEvents);
  }

  @PatchMapping("/admin/oversight/members/{userId}/verify")
  public ProfilesService.ProfileRecord verifyMember(@PathVariable String userId, @Valid @RequestBody VerifyMemberRequest request) {
    return profilesService.setVerified(userId, request.verified());
  }

  @GetMapping("/admin/oversight/verifications")
  public VerificationService.VerificationPage verifications(@Valid @ModelAttribute VerificationListRequest request) {
    return verificationService.listForAdmin(request.status(), request.limit(), request.cursor());
  }

  @PostMapping("/admin/oversight/verifications/{id}/review")
  @ResponseStatus(HttpStatus.CREATED)
  public VerificationService.VerificationRecord reviewVerification(
      @PathVariable String id,
      @Valid @RequestBody VerificationReviewRequest request,
      @AuthenticationPrincipal Jwt jwt) {
    return verificationService.review(id, CurrentUser.fromJwt(jwt).userId(),
        new VerificationService.ReviewVerificationInput(request.decision(), request.notes()));
  }

  public record TimelineRequest(@NotBlank String memberId, @Min(1) @Max(200) Integer limit) {
  }

  public record TimelineResponse(MemberRecord member, List<AccessRequestRecord> accessRequests,
      List<ConsentGrantRecord> consentGrants, List<AuditTimelineEvent> auditEvents) {
  }

  public record MemberRecord(String userId, String publicUserId, String role, String createdAt, String updatedAt) {
  }

  public record AccessRequestRecord(String id, String requesterUserId, String ownerUserId, Object requestedFields,
      String purpose, String status, String createdAt, String resolvedAt) {
  }

  public record ConsentGrantRecord(String id, String ownerUserId, String granteeUserId, Object grantedFields,
      String purpose, String status, String grantedAt, String expiresAt, String revokedAt, String revokeReason) {
  }

  public record AuditTimelineEvent(String id, String eventType, String purpose, String actorUserId,
      String targetUserId, Object metadata, String createdAt) {
  }

  public record VerifyMemberRequest(@NotNull Boolean verified) {
  }

  public record VerificationListRequest(
      @Pattern(regexp = "pending|under_review|approved|rejected") String status,
      @Min(1) @Max(100) Integer limit,
      String cursor) {
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

  private static MemberRecord memberRecord(Map<String, Object> row) {
    return new MemberRecord(string(row, "userId"), string(row, "publicUserId"), string(row, "role"),
        string(row, "createdAt"), string(row, "updatedAt"));
  }

  private static AccessRequestRecord accessRequestRecord(Map<String, Object> row) {
    return new AccessRequestRecord(string(row, "id"), string(row, "requesterUserId"), string(row, "ownerUserId"),
        row.get("requestedFields"), string(row, "purpose"), string(row, "status"), string(row, "createdAt"),
        string(row, "resolvedAt"));
  }

  private static ConsentGrantRecord consentGrantRecord(Map<String, Object> row) {
    return new ConsentGrantRecord(string(row, "id"), string(row, "ownerUserId"), string(row, "granteeUserId"),
        row.get("grantedFields"), string(row, "purpose"), string(row, "status"), string(row, "grantedAt"),
        string(row, "expiresAt"), string(row, "revokedAt"), string(row, "revokeReason"));
  }

  private static AuditTimelineEvent auditTimelineEvent(Map<String, Object> row) {
    return new AuditTimelineEvent(string(row, "id"), string(row, "eventType"), string(row, "purpose"),
        string(row, "actorUserId"), string(row, "targetUserId"), row.get("metadata"), string(row, "createdAt"));
  }

  private static String string(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value == null ? null : String.valueOf(value);
  }
}
