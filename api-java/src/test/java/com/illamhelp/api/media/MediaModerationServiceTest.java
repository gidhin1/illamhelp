package com.illamhelp.api.media;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.notifications.NotificationService;
import com.illamhelp.api.storage.StorageService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MediaModerationServiceTest {
  @Test
  void processesTechnicalValidationAndQueuesAiReviewUsingConfiguredPolicy() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    AuditService audit = mock(AuditService.class);
    MediaModerationService service = service(repository, mock(NotificationService.class), audit, mock(StorageService.class));
    when(repository.listPendingAutomatedJobs(10)).thenReturn(List.of(
        Map.of("id", "job", "mediaId", "media", "stage", "technical_validation")));
    when(repository.claimModerationJob("job")).thenReturn(1);
    when(repository.findTechnicalMedia("media")).thenReturn(Map.of("ownerUserId", "owner", "kind", "image",
        "contentType", "image/jpeg", "fileSizeBytes", 100L));

    assertThat(service.processPendingJobs("admin", null)).containsEntry("technicalApproved", 1);
    verify(repository).approveModerationJob("job");
    verify(repository).enqueueModerationStage(org.mockito.ArgumentMatchers.eq("media"),
        org.mockito.ArgumentMatchers.eq("ai_review"), org.mockito.ArgumentMatchers.anyString());
    verify(audit).logEvent(org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_technical_validation_passed"),
        org.mockito.ArgumentMatchers.isNull(), any());
  }

  @Test
  void rejectsMediaThatViolatesConfiguredTechnicalContentPolicy() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), mock(StorageService.class));
    when(repository.listPendingAutomatedJobs(10)).thenReturn(List.of(
        Map.of("id", "job", "mediaId", "media", "stage", "technical_validation")));
    when(repository.claimModerationJob("job")).thenReturn(1);
    when(repository.findTechnicalMedia("media")).thenReturn(Map.of("ownerUserId", "owner", "kind", "image",
        "contentType", "application/pdf", "fileSizeBytes", 100L));

    assertThat(service.processPendingJobs("admin", null)).containsEntry("technicalRejected", 1);
    verify(repository).rejectTechnicalJob("job", "technical_unsupported_content_type");
    verify(repository).rejectTechnicalAsset("media", "technical_unsupported_content_type");
  }

  @Test
  @SuppressWarnings("unchecked")
  void returnsModerationDetailsWithPreviewUrlNamesExpectedByAdminClient() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), storage);
    when(repository.findModerationMedia("media")).thenReturn(Map.of("bucketName", "quarantine", "objectKey", "file"));
    when(repository.listModerationJobs("media")).thenReturn(List.of());
    when(storage.presignedGet("quarantine", "file")).thenReturn(
        Map.of("downloadUrl", "signed", "downloadUrlExpiresAt", "expires"));

    Map<String, Object> media = (Map<String, Object>) service.getModerationDetails("media").get("media");

    assertThat(media).containsEntry("previewUrl", "signed").containsEntry("previewUrlExpiresAt", "expires");
  }

  @Test
  void appliesHumanReviewAndRejectsInvalidDecision() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    MediaModerationService service = service(repository, notifications, mock(AuditService.class), mock(StorageService.class));
    when(repository.findPendingHumanReviewJobId("media")).thenReturn("review");
    when(repository.updateHumanReviewState("media", "approved", null)).thenReturn(Map.of("ownerUserId", "owner"));

    assertThat(service.reviewMedia("admin", "media", Map.of("decision", "approved")))
        .containsEntry("ownerUserId", "owner");
    verify(notifications).create(org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_approved"), anyString(), anyString(), any());
    assertThatThrownBy(() -> service.reviewMedia("admin", "media", Map.of("decision", "perhaps")))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported media review decision");
  }

  private MediaModerationService service(MediaAssetRepository repository, NotificationService notifications,
      AuditService audit, StorageService storage) {
    return new MediaModerationService(repository, notifications, audit, storage, new ObjectMapper(), properties());
  }
}
