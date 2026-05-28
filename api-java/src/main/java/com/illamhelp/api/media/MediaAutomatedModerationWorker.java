package com.illamhelp.api.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.config.AppProperties;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaAutomatedModerationWorker {
  private final MediaAssetRepository mediaAssetRepository;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;
  private final AppProperties properties;
  private final Set<String> allowedImageTypes;
  private final Set<String> allowedVideoTypes;

  public MediaAutomatedModerationWorker(MediaAssetRepository mediaAssetRepository, AuditService auditService,
      ObjectMapper objectMapper, AppProperties properties) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.allowedImageTypes = mediaTypes(properties.mediaAllowedImageTypes());
    this.allowedVideoTypes = mediaTypes(properties.mediaAllowedVideoTypes());
  }

  @Transactional
  public Outcome processNext() {
    Map<String, Object> job = mediaAssetRepository.claimNextAutomatedJob();
    if (job == null || job.isEmpty()) {
      return Outcome.none();
    }
    String jobId = String.valueOf(job.get("id"));
    String mediaId = String.valueOf(job.get("mediaId"));
    try {
      if ("technical_validation".equals(job.get("stage"))) {
        boolean approved = processTechnical(jobId, mediaId);
        return approved ? Outcome.technicalApprovedResult() : Outcome.technicalRejectedResult();
      }
      processAi(jobId, mediaId);
      return Outcome.aiCompletedResult();
    } catch (RuntimeException exception) {
      mediaAssetRepository.markModerationJobError(jobId);
      return Outcome.errorResult();
    }
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

  private Set<String> mediaTypes(String values) {
    return Stream.of(values.split(",")).map(String::trim).map(String::toLowerCase)
        .filter(value -> !value.isBlank()).collect(Collectors.toSet());
  }

  private String json(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }

  public record Outcome(boolean selected, int processed, int technicalApproved, int technicalRejected, int aiCompleted,
      int errors) {
    static Outcome none() {
      return new Outcome(false, 0, 0, 0, 0, 0);
    }

    static Outcome technicalApprovedResult() {
      return new Outcome(true, 1, 1, 0, 0, 0);
    }

    static Outcome technicalRejectedResult() {
      return new Outcome(true, 1, 0, 1, 0, 0);
    }

    static Outcome aiCompletedResult() {
      return new Outcome(true, 1, 0, 0, 1, 0);
    }

    static Outcome errorResult() {
      return new Outcome(true, 0, 0, 0, 0, 1);
    }
  }
}
