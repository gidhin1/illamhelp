package com.illamhelp.api.profiles;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.notifications.NotificationService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationService {
  private final VerificationRequestRepository verificationRequestRepository;
  private final AuditService auditService;
  private final ProfilesService profilesService;
  private final NotificationService notificationService;

  public VerificationService(
      VerificationRequestRepository verificationRequestRepository,
      AuditService auditService,
      ProfilesService profilesService,
      NotificationService notificationService) {
    this.verificationRequestRepository = verificationRequestRepository;
    this.auditService = auditService;
    this.profilesService = profilesService;
    this.notificationService = notificationService;
  }

  @Transactional
  public Map<String, Object> submit(String userId, Map<String, Object> body) {
    Object rawDocumentIds = body.get("documentMediaIds");
    if (!(rawDocumentIds instanceof List<?> documentIds) || documentIds.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one document media ID is required");
    }
    if (!verificationRequestRepository.activeForUser(userId).isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "You already have a pending verification request. Please wait for it to be reviewed.");
    }

    String[] mediaIds = documentIds.stream().map(String::valueOf).toArray(String[]::new);
    Map<String, Object> record = verificationRequestRepository.insertRequest(userId, mediaIds,
        String.valueOf(body.getOrDefault("documentType", "identity")).trim(), body.get("notes"));
    auditService.logEvent(userId, userId, "verification_request_submitted", null,
        Map.of(
            "verificationRequestId", String.valueOf(record.get("id")),
            "documentType", String.valueOf(record.get("documentType")),
            "documentCount", mediaIds.length));
    return record;
  }

  public Map<String, Object> getMyVerification(String userId) {
    Map<String, Object> record = verificationRequestRepository.latestForUser(userId);
    return record == null || record.isEmpty() ? null : record;
  }

  public Map<String, Object> listForAdmin(String status, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<Map<String, Object>> rows = verificationRequestRepository.listForAdmin(status, cursor.createdAt(), cursor.id(), safeLimit + 1);
    return CursorPages.response(rows, safeLimit, "createdAt");
  }

  @Transactional
  public Map<String, Object> review(String requestId, String actorUserId, Map<String, Object> body) {
    Map<String, Object> existing = verificationRequestRepository.findReviewTarget(requestId);
    if (existing == null || existing.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Verification request not found");
    }
    String currentStatus = String.valueOf(existing.get("status"));
    if (!List.of("pending", "under_review").contains(currentStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Cannot review a verification request in '" + currentStatus + "' status");
    }
    String decision = String.valueOf(body.getOrDefault("decision", "rejected"));
    String status = "approved".equals(decision) ? "approved" : "rejected";
    Map<String, Object> record = verificationRequestRepository.reviewUpdate(requestId, actorUserId, status, body.get("notes"));
    if (record == null || record.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "Verification request was already reviewed");
    }
    String targetUserId = String.valueOf(existing.get("userId"));
    if ("approved".equals(status)) {
      profilesService.setVerified(targetUserId, true);
    }
    Map<String, Object> auditMetadata = new HashMap<>();
    auditMetadata.put("verificationRequestId", requestId);
    auditMetadata.put("reviewerNotes", body.get("notes"));
    auditService.logEvent(actorUserId, targetUserId, "verification_request_" + status, null, auditMetadata);
    boolean approved = "approved".equals(status);
    notificationService.create(
        targetUserId,
        approved ? "verification_approved" : "verification_rejected",
        approved ? "Verification approved!" : "Verification not approved",
        approved
            ? "Your identity has been verified. You now have a verified badge."
            : "Your verification request was not approved. You can resubmit.",
        Map.of("verificationRequestId", requestId, "decision", status));
    return record;
  }
}
