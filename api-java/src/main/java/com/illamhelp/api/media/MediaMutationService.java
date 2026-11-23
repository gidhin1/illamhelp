package com.illamhelp.api.media;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.events.InternalEventsService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaMutationService {
  private final MediaAssetRepository mediaAssetRepository;
  private final AuditService auditService;
  private final InternalEventsService internalEventsService;

  public MediaMutationService(MediaAssetRepository mediaAssetRepository, AuditService auditService,
      InternalEventsService internalEventsService) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.auditService = auditService;
    this.internalEventsService = internalEventsService;
  }

  @Transactional
  public void recordUploadTicket(String userId, String mediaId, String profileUserId, String jobId, String purpose,
      String kind, String bucket, String objectKey, String contentType, Long fileSizeBytes, String checksumSha256,
      String moderationDetails) {
    mediaAssetRepository.insertAsset(mediaId, userId, profileUserId, jobId, purpose, kind, bucket, objectKey, contentType,
        fileSizeBytes, checksumSha256);
    mediaAssetRepository.enqueueTechnicalValidation(mediaId, moderationDetails);
    auditService.logEvent(userId, null, "media_upload_ticket_created", null,
        Map.of("mediaId", mediaId, "kind", kind, "purpose", purpose));
    internalEventsService.mediaUploadTicketIssued(userId, mediaId, bucket, objectKey, kind, contentType,
        fileSizeBytes == null ? 0 : fileSizeBytes, checksumSha256 == null ? "" : checksumSha256);
  }

  @Transactional
  public MediaService.MediaAssetRecord requestReview(String userId, String mediaId) {
    try {
      java.util.UUID.fromString(mediaId);
    } catch (IllegalArgumentException exception) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid media ID");
    }
    int queued = mediaAssetRepository.enqueueOwnerAppeal(userId, mediaId);
    Map<String, Object> asset = mediaAssetRepository.findOwnedMedia(userId, mediaId);
    if (asset == null || asset.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media not found");
    }
    if (queued == 1) {
      auditService.logEvent(userId, null, "media_review_requested", null, Map.of("mediaId", mediaId));
    } else if (!"appeal_pending".equals(asset.get("state"))) {
      throw new ApiException(HttpStatus.CONFLICT, "A review is unavailable for this upload");
    }
    return MediaService.mediaAssetRecord(asset);
  }

  @Transactional
  public MediaService.MediaAssetRecord recordVerifiedCompletion(String userId, String mediaId, String normalizedEtag) {
    Map<String, Object> asset = mediaAssetRepository.completeUpload(userId, mediaId);
    if (asset == null || asset.isEmpty()) {
      throw new ApiException(HttpStatus.CONFLICT, "Media upload was already completed");
    }
    auditService.logEvent(userId, null, "media_upload_completed", null,
        Map.of("mediaId", mediaId, "verifiedByHead", true));
    internalEventsService.mediaUploadCompleted(userId, mediaId, normalizedEtag, true);
    return MediaService.mediaAssetRecord(asset);
  }
}
