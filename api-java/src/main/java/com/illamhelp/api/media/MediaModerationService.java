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

  public List<ModerationQueueItem> listModerationQueue(String stage, String status, int limit) {
    validateFilter(stage, STAGES, "moderation stage");
    validateFilter(status, STATUSES, "moderation status");
    return mediaAssetRepository.listModerationQueue(stage, status, Math.max(1, Math.min(limit, 100)))
        .stream()
        .map(MediaModerationService::moderationQueueItem)
        .toList();
  }

  public ModerationDetails getModerationDetails(String mediaId) {
    Map<String, Object> found = mediaAssetRepository.findModerationMedia(mediaId);
    if (found == null || found.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    StorageService.PresignedGetTicket signed = storageService.presignedGet(
        String.valueOf(found.get("bucketName")), String.valueOf(found.get("objectKey")));
    ModerationMedia media = new ModerationMedia(
        MediaService.string(found, "id"),
        MediaService.string(found, "ownerUserId"),
        MediaService.string(found, "profileUserId"),
        MediaService.string(found, "jobId"),
        MediaService.string(found, "kind"),
        MediaService.string(found, "purpose"),
        MediaService.string(found, "bucketName"),
        MediaService.string(found, "objectKey"),
        MediaService.string(found, "contentType"),
        MediaService.longValue(found, "fileSizeBytes"),
        MediaService.string(found, "checksumSha256"),
        MediaService.string(found, "state"),
        found.get("moderationReasonCodes"),
        found.get("aiScores"),
        MediaService.string(found, "createdAt"),
        MediaService.string(found, "updatedAt"),
        signed.downloadUrl(),
        signed.downloadUrlExpiresAt());
    return new ModerationDetails(media, mediaAssetRepository.listModerationJobs(mediaId).stream()
        .map(MediaModerationService::moderationJob)
        .toList());
  }

  public ProcessModerationResult processPendingJobs(String actorUserId, ProcessModerationInput input) {
    int limit = processLimit(input);
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
    ProcessModerationResult result = new ProcessModerationResult(
        selected, processed, technicalApproved, technicalRejected, aiCompleted, errors);
    auditService.logEvent(actorUserId, actorUserId, "media_moderation_batch_processed", null,
        new HashMap<>(Map.of(
            "selected", result.selected(),
            "processed", result.processed(),
            "technicalApproved", result.technicalApproved(),
            "technicalRejected", result.technicalRejected(),
            "aiCompleted", result.aiCompleted(),
            "errors", result.errors())));
    return result;
  }

  @Transactional
  public MediaService.MediaAssetRecord reviewMedia(String moderatorUserId, String mediaId, ReviewMediaInput body) {
    String decision = body == null ? null : body.decision();
    if (!List.of("approved", "rejected").contains(decision)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported media review decision");
    }
    String reasonCode = "approved".equals(decision) ? null
        : body.reasonCode() == null ? "human_rejected" : body.reasonCode();
    String notes = body.notes();
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
    MediaService.MediaAssetRecord reviewedAsset = MediaService.mediaAssetRecord(asset);
    notificationService.create(reviewedAsset.ownerUserId(),
        "approved".equals(decision) ? "media_approved" : "media_rejected",
        "approved".equals(decision) ? "Media approved" : "Media rejected",
        "approved".equals(decision) ? "Your media is now approved." : "Your media was rejected.",
        Map.of("mediaId", mediaId));
    auditService.logEvent(moderatorUserId, reviewedAsset.ownerUserId(),
        "media_human_review_decided", null,
        Map.of("mediaId", mediaId, "moderationJobId", moderationJobId, "decision", decision));
    return reviewedAsset;
  }

  private static ModerationQueueItem moderationQueueItem(Map<String, Object> row) {
    return new ModerationQueueItem(
        MediaService.string(row, "moderationJobId"),
        MediaService.string(row, "mediaId"),
        MediaService.string(row, "stage"),
        MediaService.string(row, "status"),
        MediaService.string(row, "reasonCode"),
        MediaService.string(row, "moderationCreatedAt"),
        MediaService.string(row, "mediaState"),
        MediaService.string(row, "ownerUserId"),
        MediaService.string(row, "kind"),
        MediaService.string(row, "purpose"),
        MediaService.string(row, "contentType"),
        MediaService.longValue(row, "fileSizeBytes"));
  }

  private static ModerationJob moderationJob(Map<String, Object> row) {
    return new ModerationJob(
        MediaService.string(row, "id"),
        MediaService.string(row, "mediaAssetId"),
        MediaService.string(row, "stage"),
        MediaService.string(row, "status"),
        MediaService.string(row, "assignedModeratorUserId"),
        MediaService.string(row, "reasonCode"),
        row.get("details"),
        MediaService.string(row, "createdAt"),
        MediaService.string(row, "completedAt"));
  }

  private int processLimit(ProcessModerationInput input) {
    Integer limit = input == null ? null : input.limit();
    return limit == null ? 10 : Math.max(1, Math.min(limit, 200));
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

  public record ModerationQueueItem(String moderationJobId, String mediaId, String stage, String status,
      String reasonCode, String moderationCreatedAt, String mediaState, String ownerUserId, String kind,
      String purpose, String contentType, Long fileSizeBytes) {
  }

  public record ModerationDetails(ModerationMedia media, List<ModerationJob> moderationJobs) {
  }

  public record ModerationMedia(String id, String ownerUserId, String profileUserId, String jobId, String kind,
      String purpose, String bucketName, String objectKey, String contentType, Long fileSizeBytes,
      String checksumSha256, String state, Object moderationReasonCodes, Object aiScores, String createdAt,
      String updatedAt, String previewUrl, String previewUrlExpiresAt) {
  }

  public record ModerationJob(String id, String mediaAssetId, String stage, String status,
      String assignedModeratorUserId, String reasonCode, Object details, String createdAt, String completedAt) {
  }

  public record ReviewMediaInput(String decision, String reasonCode, String notes) {
  }

  public record ProcessModerationInput(Integer limit) {
  }

  public record ProcessModerationResult(int selected, int processed, int technicalApproved, int technicalRejected,
      int aiCompleted, int errors) {
  }
}
