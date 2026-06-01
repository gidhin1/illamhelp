package com.illamhelp.api.profiles;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.notifications.NotificationService;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
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
  public VerificationRecord submit(String userId, SubmitVerificationInput body) {
    if (body.documentMediaIds() == null || body.documentMediaIds().isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one document media ID is required");
    }
    if (!verificationRequestRepository.activeForUser(userId).isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "You already have a pending verification request. Please wait for it to be reviewed.");
    }

    String[] mediaIds = body.documentMediaIds().stream().map(String::valueOf).toArray(String[]::new);
    String documentType = body.documentType() == null || body.documentType().isBlank() ? "identity" : body.documentType().trim();
    VerificationRequestRepository.VerificationRecordRow record = verificationRequestRepository.insertRequest(
        userId, mediaIds, documentType, body.notes());
    auditService.logEvent(userId, userId, "verification_request_submitted", null,
        Map.of(
            "verificationRequestId", record.getId(),
            "documentType", record.getDocumentType(),
            "documentCount", mediaIds.length));
    return toRecord(record);
  }

  public VerificationRecord getMyVerification(String userId) {
    VerificationRequestRepository.VerificationRecordRow record = verificationRequestRepository.latestForUser(userId);
    return record == null ? null : toRecord(record);
  }

  public VerificationPage listForAdmin(String status, Integer limit, String cursorValue) {
    int safeLimit = limit == null ? 50 : Math.max(1, Math.min(limit, 100));
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<VerificationRecord> rows = verificationRequestRepository
        .listForAdmin(status, cursor.createdAt(), cursor.id(), safeLimit + 1)
        .stream()
        .map(this::toRecord)
        .toList();
    return toPage(rows, safeLimit, VerificationRecord::createdAt);
  }

  @Transactional
  public VerificationRecord review(String requestId, String actorUserId, ReviewVerificationInput body) {
    VerificationRequestRepository.ReviewTargetRow existing = verificationRequestRepository.findReviewTarget(requestId);
    if (existing == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Verification request not found");
    }
    String currentStatus = existing.getStatus();
    if (!List.of("pending", "under_review").contains(currentStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Cannot review a verification request in '" + currentStatus + "' status");
    }
    String decision = body == null || body.decision() == null ? "rejected" : body.decision();
    String status = "approved".equals(decision) ? "approved" : "rejected";
    VerificationRequestRepository.VerificationRecordRow record = verificationRequestRepository.reviewUpdate(
        requestId, actorUserId, status, body == null ? null : body.notes());
    if (record == null) {
      throw new ApiException(HttpStatus.CONFLICT, "Verification request was already reviewed");
    }
    String targetUserId = existing.getUserId();
    if ("approved".equals(status)) {
      profilesService.setVerified(targetUserId, true);
    }
    Map<String, Object> auditMetadata = new HashMap<>();
    auditMetadata.put("verificationRequestId", requestId);
    auditMetadata.put("reviewerNotes", body == null ? null : body.notes());
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
    return toRecord(record);
  }

  private VerificationRecord toRecord(VerificationRequestRepository.VerificationRecordRow row) {
    return new VerificationRecord(
        row.getId(),
        row.getUserId(),
        row.getDocumentMediaIds() == null ? List.of() : List.of(row.getDocumentMediaIds()),
        row.getDocumentType(),
        row.getNotes(),
        row.getStatus(),
        row.getReviewerUserId(),
        row.getReviewerNotes(),
        row.getReviewedAt(),
        row.getCreatedAt(),
        row.getUpdatedAt());
  }

  private VerificationPage toPage(List<VerificationRecord> rows, int limit, Function<VerificationRecord, String> orderedAt) {
    boolean hasMore = rows.size() > limit;
    List<VerificationRecord> items = hasMore ? rows.subList(0, limit) : rows;
    String nextCursor = hasMore ? encodeCursor(orderedAt.apply(items.getLast()), items.getLast().id()) : null;
    return new VerificationPage(items, limit, nextCursor);
  }

  private String encodeCursor(String createdAt, String id) {
    String value = createdAt + "\u001f" + id;
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  public record SubmitVerificationInput(String documentType, List<String> documentMediaIds, String notes) {
  }

  public record ReviewVerificationInput(String decision, String notes) {
  }

  public record VerificationRecord(String id, String userId, List<String> documentMediaIds, String documentType,
      String notes, String status, String reviewerUserId, String reviewerNotes, String reviewedAt, String createdAt,
      String updatedAt) {
  }

  public record VerificationPage(List<VerificationRecord> items, int limit, String nextCursor) {
  }
}
