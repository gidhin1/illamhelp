package com.illamhelp.api.media;

import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
    MediaAutomatedModerationWorker service = worker(repository, audit);
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "technical_validation"));
    when(repository.findTechnicalMedia("media")).thenReturn(Map.of("ownerUserId", "owner", "kind", "image",
        "contentType", "image/jpeg", "fileSizeBytes", 100L));

    assertThat(service.processNext().technicalApproved()).isEqualTo(1);
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
    MediaAutomatedModerationWorker service = worker(repository, mock(AuditService.class));
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "technical_validation"));
    when(repository.findTechnicalMedia("media")).thenReturn(Map.of("ownerUserId", "owner", "kind", "image",
        "contentType", "application/pdf", "fileSizeBytes", 100L));

    assertThat(service.processNext().technicalRejected()).isEqualTo(1);
    verify(repository).rejectTechnicalJob("job", "technical_unsupported_content_type");
    verify(repository).rejectTechnicalAsset("media", "technical_unsupported_content_type");
  }

  @Test
  void completesAiReviewAndFlagsContactLeakageForHumanReview() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    AuditService audit = mock(AuditService.class);
    MediaAutomatedModerationWorker service = worker(repository, audit);
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "ai_review"));
    when(repository.findAiMedia("media")).thenReturn(Map.of(
        "ownerUserId", "owner", "objectKey", "uploads/call-now-phone.jpg", "contentType", "image/jpeg"));

    assertThat(service.processNext().aiCompleted()).isEqualTo(1);
    verify(repository).completeAiModerationJob(org.mockito.ArgumentMatchers.eq("job"), anyString());
    verify(repository).enqueueModerationStage(org.mockito.ArgumentMatchers.eq("media"),
        org.mockito.ArgumentMatchers.eq("human_review"), anyString());
    verify(repository).updateAiReviewState(org.mockito.ArgumentMatchers.eq("media"), anyString(),
        org.mockito.ArgumentMatchers.eq("ai_contact_leakage_high"));
    verify(audit).logEvent(org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_ai_review_completed"), org.mockito.ArgumentMatchers.isNull(), any());
  }

  @Test
  void marksClaimedJobAsErrorWhenAssetDisappearsDuringProcessing() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    MediaAutomatedModerationWorker service = worker(repository, mock(AuditService.class));
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "missing", "stage", "technical_validation"));
    when(repository.findTechnicalMedia("missing")).thenReturn(Map.of());

    MediaAutomatedModerationWorker.Outcome outcome = service.processNext();

    assertThat(outcome.selected()).isTrue();
    assertThat(outcome.processed()).isZero();
    assertThat(outcome.errors()).isEqualTo(1);
    verify(repository).markModerationJobError("job");
  }

  @Test
  void returnsIdleOutcomeWithoutWritesWhenModerationQueueIsEmpty() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    AuditService audit = mock(AuditService.class);
    MediaAutomatedModerationWorker service = worker(repository, audit);
    when(repository.claimNextAutomatedJob()).thenReturn(Map.of());

    assertThat(service.processNext().selected()).isFalse();

    verify(repository).claimNextAutomatedJob();
    verifyNoInteractions(audit);
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
  void moderationQueueClampsLimitAndRejectsUnknownFilters() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), mock(StorageService.class));
    when(repository.listModerationQueue("human_review", "pending", 100)).thenReturn(List.of());

    assertThat(service.listModerationQueue("human_review", "pending", 999)).isEmpty();
    verify(repository).listModerationQueue("human_review", "pending", 100);
    assertThatThrownBy(() -> service.listModerationQueue("manual", "pending", 10))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported moderation stage: manual");
    assertThatThrownBy(() -> service.listModerationQueue("human_review", "done", 10))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported moderation status: done");
  }

  @Test
  void appliesHumanReviewAndRejectsInvalidDecision() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    MediaModerationService service = service(repository, notifications, mock(AuditService.class), mock(StorageService.class));
    when(repository.findPendingHumanReviewJobId("media")).thenReturn("review");
    when(repository.completeHumanReviewJob(org.mockito.ArgumentMatchers.eq("review"), org.mockito.ArgumentMatchers.eq("approved"),
        org.mockito.ArgumentMatchers.eq("admin"), org.mockito.ArgumentMatchers.isNull(), anyString())).thenReturn(1);
    when(repository.updateHumanReviewState("media", "approved", null)).thenReturn(Map.of("ownerUserId", "owner"));

    assertThat(service.reviewMedia("admin", "media", Map.of("decision", "approved")))
        .containsEntry("ownerUserId", "owner");
    verify(notifications).create(org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_approved"), anyString(), anyString(), any());
    assertThatThrownBy(() -> service.reviewMedia("admin", "media", Map.of("decision", "perhaps")))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported media review decision");
  }

  @Test
  void lostHumanReviewRaceDoesNotNotifyOwner() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    NotificationService notifications = mock(NotificationService.class);
    MediaModerationService service = service(repository, notifications, mock(AuditService.class), mock(StorageService.class));
    when(repository.findPendingHumanReviewJobId("media")).thenReturn("review");
    when(repository.completeHumanReviewJob(org.mockito.ArgumentMatchers.eq("review"), org.mockito.ArgumentMatchers.eq("approved"),
        org.mockito.ArgumentMatchers.eq("admin"), org.mockito.ArgumentMatchers.isNull(), anyString())).thenReturn(0);

    assertThatThrownBy(() -> service.reviewMedia("admin", "media", Map.of("decision", "approved")))
        .isInstanceOf(ApiException.class).hasMessage("Media review was already completed");
    verifyNoInteractions(notifications);
  }

  @Test
  void batchDelegatesEachClaimToShortTransactionalWorker() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    MediaAutomatedModerationWorker worker = mock(MediaAutomatedModerationWorker.class);
    when(worker.processNext()).thenReturn(
        new MediaAutomatedModerationWorker.Outcome(true, 1, 1, 0, 0, 0),
        new MediaAutomatedModerationWorker.Outcome(false, 0, 0, 0, 0, 0));
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), mock(StorageService.class), worker);

    assertThat(service.processPendingJobs("admin", Map.of("limit", 10)))
        .containsEntry("selected", 1).containsEntry("processed", 1);
    verify(worker, org.mockito.Mockito.times(2)).processNext();
  }

  @Test
  void schedulerProcessesConfiguredBatchAndStopsWhenQueueIsEmpty() {
    MediaAutomatedModerationWorker worker = mock(MediaAutomatedModerationWorker.class);
    when(worker.processNext()).thenReturn(
        new MediaAutomatedModerationWorker.Outcome(true, 1, 0, 0, 1, 0),
        new MediaAutomatedModerationWorker.Outcome(false, 0, 0, 0, 0, 0));

    new MediaModerationScheduler(worker, true, 10).processPendingJobs();

    verify(worker, org.mockito.Mockito.times(2)).processNext();
  }

  @Test
  void disabledSchedulerDoesNotPollModerationQueue() {
    MediaAutomatedModerationWorker worker = mock(MediaAutomatedModerationWorker.class);

    new MediaModerationScheduler(worker, false, 10).processPendingJobs();

    verifyNoInteractions(worker);
  }

  private MediaModerationService service(MediaAssetRepository repository, NotificationService notifications,
      AuditService audit, StorageService storage) {
    return service(repository, notifications, audit, storage, mock(MediaAutomatedModerationWorker.class));
  }

  private MediaModerationService service(MediaAssetRepository repository, NotificationService notifications,
      AuditService audit, StorageService storage, MediaAutomatedModerationWorker worker) {
    return new MediaModerationService(repository, notifications, audit, storage, new ObjectMapper(), worker);
  }

  private MediaAutomatedModerationWorker worker(MediaAssetRepository repository, AuditService audit) {
    return new MediaAutomatedModerationWorker(repository, audit, new ObjectMapper(), properties());
  }
}
