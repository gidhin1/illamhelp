package com.illamhelp.api.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.notifications.NotificationService;
import com.illamhelp.api.storage.StorageService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
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
  private final AppProperties properties;
  private final Set<String> allowedImageTypes;
  private final Set<String> allowedVideoTypes;

  public MediaModerationService(MediaAssetRepository mediaAssetRepository, NotificationService notificationService,
      AuditService auditService, StorageService storageService, ObjectMapper objectMapper, AppProperties properties) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.notificationService = notificationService;
    this.auditService = auditService;
    this.storageService = storageService;
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.allowedImageTypes = mediaTypes(properties.mediaAllowedImageTypes());
    this.allowedVideoTypes = mediaTypes(properties.mediaAllowedVideoTypes());
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

  @Transactional
  public Map<String, Integer> processPendingJobs(String actorUserId, Map<String, Object> body) {
    int limit = processLimit(body);
    List<Map<String, Object>> jobs = mediaAssetRepository.listPendingAutomatedJobs(limit);
    int processed = 0;
    int technicalApproved = 0;
    int technicalRejected = 0;
    int aiCompleted = 0;
    int errors = 0;
    for (Map<String, Object> job : jobs) {
      String jobId = String.valueOf(job.get("id"));
      String mediaId = String.valueOf(job.get("mediaId"));
      if (mediaAssetRepository.claimModerationJob(jobId) == 0) {
        continue;
      }
      try {
        if ("technical_validation".equals(job.get("stage"))) {
          boolean approved = processTechnical(jobId, mediaId);
          processed++;
          technicalApproved += approved ? 1 : 0;
          technicalRejected += approved ? 0 : 1;
        } else {
          processAi(jobId, mediaId);
          processed++;
          aiCompleted++;
        }
      } catch (RuntimeException exception) {
        errors++;
        mediaAssetRepository.markModerationJobError(jobId);
      }
    }
    Map<String, Integer> result = Map.of(
        "selected", jobs.size(), "processed", processed, "technicalApproved", technicalApproved,
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
    mediaAssetRepository.completeHumanReviewJob(moderationJobId, decision, moderatorUserId, reasonCode,
        json(Map.of("decision", decision, "reviewedBy", moderatorUserId, "notes", notes == null ? "" : notes)));
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

  private boolean processTechnical(String jobId, String mediaId) {
    Map<String, Object> media = mediaAssetRepository.findTechnicalMedia(mediaId);
    if (media == null || media.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    String kind = String.valueOf(media.get("kind"));
    String contentType = String.valueOf(media.get("contentType")).toLowerCase();
    long size = ((Number) media.get("fileSizeBytes")).longValue();
    boolean contentAllowed = ("image".equals(kind) ? allowedImageTypes : allowedVideoTypes).contains(contentType);
    boolean sizeAllowed = size > 0
        && size <= ("image".equals(kind) ? properties.mediaMaxImageBytes() : properties.mediaMaxVideoBytes());
    if (!contentAllowed || !sizeAllowed) {
      String reasonCode = contentAllowed ? "technical_size_out_of_bounds" : "technical_unsupported_content_type";
      mediaAssetRepository.rejectTechnicalJob(jobId, reasonCode);
      mediaAssetRepository.rejectTechnicalAsset(mediaId, reasonCode);
      auditService.logEvent(null, String.valueOf(media.get("ownerUserId")),
          "media_technical_validation_rejected", null,
          Map.of("mediaId", mediaId, "moderationJobId", jobId, "reasonCode", reasonCode));
      return false;
    }
    mediaAssetRepository.approveModerationJob(jobId);
    mediaAssetRepository.enqueueModerationStage(mediaId, "ai_review",
        json(Map.of("source", "technical_validation", "previousJobId", jobId)));
    auditService.logEvent(null, String.valueOf(media.get("ownerUserId")),
        "media_technical_validation_passed", null, Map.of("mediaId", mediaId, "moderationJobId", jobId));
    return true;
  }

  private void processAi(String jobId, String mediaId) {
    Map<String, Object> media = mediaAssetRepository.findAiMedia(mediaId);
    if (media == null || media.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    boolean contactRisk = (String.valueOf(media.get("objectKey")) + " " + String.valueOf(media.get("contentType")))
        .toLowerCase().matches(".*(whatsapp|telegram|phone|contact|call-now|email|number).*");
    Map<String, Object> scores = Map.of(
        "professionalRelevance", 0.82, "adultSexualRisk", 0.03, "violenceRisk", 0.02,
        "spamContactLeakageRisk", contactRisk ? 0.85 : 0.12);
    String reasonCode = contactRisk ? "ai_contact_leakage_high" : null;
    mediaAssetRepository.completeAiModerationJob(jobId, json(Map.of("aiScores", scores)));
    mediaAssetRepository.enqueueModerationStage(mediaId, "human_review",
        json(Map.of("source", "ai_review", "previousJobId", jobId, "aiScores", scores)));
    mediaAssetRepository.updateAiReviewState(mediaId, json(scores), reasonCode);
    auditService.logEvent(null, String.valueOf(media.get("ownerUserId")), "media_ai_review_completed", null,
        Map.of("mediaId", mediaId, "moderationJobId", jobId, "aiScores", scores));
  }

  private int processLimit(Map<String, Object> body) {
    Object value = body == null ? null : body.get("limit");
    if (value instanceof Number number) {
      return Math.max(1, Math.min(number.intValue(), 200));
    }
    return 10;
  }

  private Set<String> mediaTypes(String values) {
    return Stream.of(values.split(",")).map(String::trim).map(String::toLowerCase)
        .filter(value -> !value.isBlank()).collect(Collectors.toSet());
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
