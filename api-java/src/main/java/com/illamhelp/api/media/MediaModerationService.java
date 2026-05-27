package com.illamhelp.api.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import com.illamhelp.api.storage.StorageService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaModerationService {
  private static final Set<String> STAGES = Set.of("technical_validation", "ai_review", "human_review");
  private static final Set<String> STATUSES = Set.of("pending", "running", "approved", "rejected", "error");
  private final MediaAssetRepository mediaAssetRepository;
  private final NotificationService notificationService;
  private final AuditService auditService;
  private final StorageService storageService;
  private final ObjectMapper objectMapper;
  private final MediaAutomatedModerationWorker automatedWorker;

  public MediaModerationService(MediaAssetRepository mediaAssetRepository, NotificationService notificationService,
      AuditService auditService, StorageService storageService, ObjectMapper objectMapper,
      MediaAutomatedModerationWorker automatedWorker) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.notificationService = notificationService;
    this.auditService = auditService;
    this.storageService = storageService;
    this.objectMapper = objectMapper;
    this.automatedWorker = automatedWorker;
  }

  public List<Map<String, Object>> listModerationQueue(String stage, String status, int limit) {
    validateFilter(stage, STAGES, "moderation stage");
    validateFilter(status, STATUSES, "moderation status");
    return mediaAssetRepository.listModerationQueue(stage, status, Math.max(1, Math.min(limit, 100)));
  }

  public Map<String, Object> getModerationDetails(String mediaId) {
    Map<String, Object> found = mediaAssetRepository.findModerationMedia(mediaId);
    if (found == null || found.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    Map<String, Object> media = new HashMap<>(found);
    Map<String, Object> signed = storageService.presignedGet(
        String.valueOf(media.get("bucketName")), String.valueOf(media.get("objectKey")));
    media.put("previewUrl", signed.get("downloadUrl"));
    media.put("previewUrlExpiresAt", signed.get("downloadUrlExpiresAt"));
    return Map.of("media", media, "moderationJobs", mediaAssetRepository.listModerationJobs(mediaId));
  }

  public Map<String, Integer> processPendingJobs(String actorUserId, Map<String, Object> body) {
    int limit = processLimit(body);
    int selected = 0;
    int processed = 0;
    int technicalApproved = 0;
    int technicalRejected = 0;
    int aiCompleted = 0;
    int errors = 0;
    for (int count = 0; count < limit; count++) {
      MediaAutomatedModerationWorker.Outcome outcome = automatedWorker.processNext();
      if (!outcome.selected()) {
        break;
      }
      selected++;
      processed += outcome.processed();
      technicalApproved += outcome.technicalApproved();
      technicalRejected += outcome.technicalRejected();
      aiCompleted += outcome.aiCompleted();
      errors += outcome.errors();
    }
    Map<String, Integer> result = Map.of(
        "selected", selected, "processed", processed, "technicalApproved", technicalApproved,
        "technicalRejected", technicalRejected, "aiCompleted", aiCompleted, "errors", errors);
    auditService.logEvent(actorUserId, actorUserId, "media_moderation_batch_processed", null, new HashMap<>(result));
    return result;
  }

  @Transactional
  public Map<String, Object> reviewMedia(String moderatorUserId, String mediaId, Map<String, Object> body) {
    String decision = body.get("decision") == null ? null : String.valueOf(body.get("decision"));
    if (!List.of("approved", "rejected").contains(decision)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported media review decision");
    }
    String reasonCode = "approved".equals(decision) ? null
        : String.valueOf(body.getOrDefault("reasonCode", "human_rejected"));
    String notes = body.get("notes") == null ? null : String.valueOf(body.get("notes"));
    String moderationJobId = mediaAssetRepository.findPendingHumanReviewJobId(mediaId);
    if (moderationJobId == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "No pending human review found for media asset");
    }
    int reviewed = mediaAssetRepository.completeHumanReviewJob(moderationJobId, decision, moderatorUserId, reasonCode,
        json(Map.of("decision", decision, "reviewedBy", moderatorUserId, "notes", notes == null ? "" : notes)));
    if (reviewed == 0) {
      throw new ApiException(HttpStatus.CONFLICT, "Media review was already completed");
    }
    Map<String, Object> asset = mediaAssetRepository.updateHumanReviewState(mediaId, decision, reasonCode);
    if (asset == null || asset.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    notificationService.create(String.valueOf(asset.get("ownerUserId")),
        "approved".equals(decision) ? "media_approved" : "media_rejected",
        "approved".equals(decision) ? "Media approved" : "Media rejected",
        "approved".equals(decision) ? "Your media is now approved." : "Your media was rejected.",
        Map.of("mediaId", mediaId));
    auditService.logEvent(moderatorUserId, String.valueOf(asset.get("ownerUserId")),
        "media_human_review_decided", null,
        Map.of("mediaId", mediaId, "moderationJobId", moderationJobId, "decision", decision));
    return asset;
  }

  private int processLimit(Map<String, Object> body) {
    Object value = body == null ? null : body.get("limit");
    if (value instanceof Number number) {
      return Math.max(1, Math.min(number.intValue(), 200));
    }
    return 10;
  }

  private void validateFilter(String value, Set<String> choices, String field) {
    if (value != null && !choices.contains(value)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported " + field + ": " + value);
    }
  }

  private String json(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }
}
