package com.illamhelp.api.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.notifications.NotificationService;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class MediaAutomatedModerationWorker {
  private final MediaAssetRepository mediaAssetRepository;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;
  private final AppProperties properties;
  private final TransactionTemplate transactions;
  private final ClamAvMediaScanner scanner;
  private final NotificationService notifications;
  private final Set<String> allowedImageTypes;
  private final Set<String> allowedVideoTypes;

  public MediaAutomatedModerationWorker(MediaAssetRepository mediaAssetRepository, AuditService auditService,
      ObjectMapper objectMapper, AppProperties properties, PlatformTransactionManager transactionManager,
      ClamAvMediaScanner scanner, NotificationService notifications) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
    this.properties = properties;
    this.transactions = new TransactionTemplate(transactionManager);
    this.scanner = scanner;
    this.notifications = notifications;
    this.allowedImageTypes = mediaTypes(properties.mediaAllowedImageTypes());
    this.allowedVideoTypes = mediaTypes(properties.mediaAllowedVideoTypes());
  }

  public Outcome processNext() {
    Work work = transactions.execute(status -> claim());
    if (work.outcome() != null) {
      return work.outcome();
    }
    ClamAvMediaScanner.Screening result;
    try {
      result = scanner.scan(work.asset());
    } catch (IOException | RuntimeException exception) {
      return transactions.execute(status -> finishScreening(work, null));
    }
    return transactions.execute(status -> finishScreening(work, result));
  }

  private Work claim() {
    Map<String, Object> job = mediaAssetRepository.claimNextAutomatedJob();
    if (job == null || job.isEmpty()) {
      return Work.completed(Outcome.none());
    }
    String jobId = String.valueOf(job.get("id"));
    String mediaId = String.valueOf(job.get("mediaId"));
    if ("technical_validation".equals(job.get("stage"))) {
      return Work.completed(processTechnical(jobId, mediaId));
    }
    Map<String, Object> asset = mediaAssetRepository.findAiMedia(mediaId);
    if (asset == null || asset.isEmpty()) {
      mediaAssetRepository.markModerationJobError(jobId);
      return Work.completed(Outcome.errorResult());
    }
    return new Work(jobId, mediaId, String.valueOf(job.get("leaseToken")),
        ((Number) job.get("attempts")).intValue(), new LinkedHashMap<>(asset), null);
  }

  private record Work(String jobId, String mediaId, String lease, int attempts, Map<String, Object> asset, Outcome outcome) {
    static Work completed(Outcome outcome) {
      return new Work(null, null, null, 0, null, outcome);
    }
  }

  private Outcome processTechnical(String jobId, String mediaId) {
    Map<String, Object> media = mediaAssetRepository.findTechnicalMedia(mediaId);
    if (media == null || media.isEmpty()) {
      mediaAssetRepository.markModerationJobError(jobId);
      return Outcome.errorResult();
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
      return Outcome.technicalRejectedResult();
    }
    mediaAssetRepository.approveModerationJob(jobId);
    mediaAssetRepository.enqueueModerationStage(mediaId, "ai_review",
        json(Map.of("source", "technical_validation", "previousJobId", jobId)));
    auditService.logEvent(null, String.valueOf(media.get("ownerUserId")),
        "media_technical_validation_passed", null, Map.of("mediaId", mediaId, "moderationJobId", jobId));
    return Outcome.technicalApprovedResult();
  }

  private Outcome finishScreening(Work work, ClamAvMediaScanner.Screening result) {
    if (mediaAssetRepository.lockScreeningLease(work.jobId(), work.lease()) == null) {
      return Outcome.errorResult();
    }
    Map<String, Object> current = mediaAssetRepository.findAiMedia(work.mediaId());
    if (current == null || !work.asset().equals(new LinkedHashMap<>(current))) {
      result = null;
    }
    int[] retryMinutes = {1, 5, 30};
    if (result == null && work.attempts() <= retryMinutes.length) {
      mediaAssetRepository.retryScreening(work.jobId(), retryMinutes[work.attempts() - 1]);
      return Outcome.errorResult();
    }
    String ownerId = String.valueOf(work.asset().get("ownerUserId"));
    String rejection = null;
    if (result != null && result.malware() == ClamAvMediaScanner.Result.INFECTED) {
      rejection = "malware_detected";
    } else if (result != null && result.malware() == ClamAvMediaScanner.Result.CLEAN
        && "format_mismatch".equals(result.contentChecks().get("photoValidation"))) {
      rejection = "technical_photo_format_mismatch";
    }
    if (rejection != null) {
      mediaAssetRepository.rejectTechnicalJob(work.jobId(), rejection);
      mediaAssetRepository.rejectTechnicalAsset(work.mediaId(), rejection);
      notifications.create(ownerId, "media_rejected", "Media rejected", MediaService.rejectionMessage(rejection),
          Map.of("mediaId", work.mediaId(), "reasonCode", rejection));
      auditService.logEvent(null, ownerId,
          "malware_detected".equals(rejection) ? "media_malware_rejected" : "media_technical_validation_rejected", null,
          Map.of("mediaId", work.mediaId(), "moderationJobId", work.jobId(), "reasonCode", rejection));
      return Outcome.technicalRejectedResult();
    }
    Map<String, Object> evidence = new LinkedHashMap<>();
    evidence.put("screeningStatus", "human_review_required");
    evidence.put("malwareCheck", result == null ? "unavailable" : result.malware().name().toLowerCase(java.util.Locale.ROOT));
    if (result != null) {
      evidence.putAll(result.contentChecks());
    }
    mediaAssetRepository.completeAiModerationJob(work.jobId(), json(evidence));
    mediaAssetRepository.enqueueModerationStage(work.mediaId(), "human_review", json(evidence));
    mediaAssetRepository.updateAiReviewState(work.mediaId(), null, null);
    auditService.logEvent(null, ownerId, "media_routed_to_human_review", null,
        Map.of("mediaId", work.mediaId(), "moderationJobId", work.jobId()));
    return Outcome.aiCompletedResult();
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
