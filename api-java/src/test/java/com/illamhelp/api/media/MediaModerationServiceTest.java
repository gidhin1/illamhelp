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
  void routesUnscreenedMediaToHumanReviewWithoutSimulatedScores() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    AuditService audit = mock(AuditService.class);
    MediaAutomatedModerationWorker service = worker(repository, audit);
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "ai_review", "leaseToken", "lease", "attempts", 1));
    var row = Map.<String, Object>of(
        "ownerUserId", "owner", "objectKey", "uploads/call-now-phone.jpg", "contentType", "image/jpeg");
    when(repository.findAiMedia("media")).thenReturn(repositoryRow(row), repositoryRow(row));

    when(repository.lockScreeningLease("job", "lease")).thenReturn("job");
    assertThat(service.processNext().aiCompleted()).isEqualTo(1);
    verify(repository).completeAiModerationJob(org.mockito.ArgumentMatchers.eq("job"), anyString());
    verify(repository).enqueueModerationStage(org.mockito.ArgumentMatchers.eq("media"),
        org.mockito.ArgumentMatchers.eq("human_review"), anyString());
    verify(repository).updateAiReviewState("media", null, null);
    verify(audit).logEvent(org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_routed_to_human_review"), org.mockito.ArgumentMatchers.isNull(), any());
  }

  @Test
  void rejectsConfirmedMalwareAndNotifiesTheOwner() throws Exception {
    var repository = mock(MediaAssetRepository.class);
    var scanner = mock(ClamAvMediaScanner.class);
    var notifications = mock(NotificationService.class);
    var service = new MediaAutomatedModerationWorker(repository, mock(AuditService.class), new ObjectMapper(),
        properties(), mock(org.springframework.transaction.PlatformTransactionManager.class), scanner, notifications);
    var asset = Map.<String, Object>of("ownerUserId", "owner");
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "ai_review", "leaseToken", "lease", "attempts", 1));
    when(repository.findAiMedia("media")).thenReturn(asset);
    when(repository.lockScreeningLease("job", "lease")).thenReturn("job");
    when(scanner.scan(asset)).thenReturn(new ClamAvMediaScanner.Screening(ClamAvMediaScanner.Result.INFECTED));

    assertThat(service.processNext().technicalRejected()).isEqualTo(1);
    verify(repository).rejectTechnicalAsset("media", "malware_detected");
    verify(notifications).create("owner", "media_rejected", "Media rejected",
        "This file failed the security scan. Upload a new copy from a trusted source.",
        Map.of("mediaId", "media", "reasonCode", "malware_detected"));
  }

  @Test
  void rejectsAConfirmedFormatMismatchWithSafeCopy() throws Exception {
    var repository = mock(MediaAssetRepository.class);
    var scanner = mock(ClamAvMediaScanner.class);
    var notifications = mock(NotificationService.class);
    var service = new MediaAutomatedModerationWorker(repository, mock(AuditService.class), new ObjectMapper(),
        properties(), mock(org.springframework.transaction.PlatformTransactionManager.class), scanner, notifications);
    var asset = Map.<String, Object>of("ownerUserId", "owner");
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "ai_review", "leaseToken", "lease", "attempts", 1));
    when(repository.findAiMedia("media")).thenReturn(asset);
    when(repository.lockScreeningLease("job", "lease")).thenReturn("job");
    when(scanner.scan(asset)).thenReturn(new ClamAvMediaScanner.Screening(ClamAvMediaScanner.Result.CLEAN,
        Map.of("photoValidation", "format_mismatch")));

    assertThat(service.processNext().technicalRejected()).isEqualTo(1);
    verify(repository).rejectTechnicalAsset("media", "technical_photo_format_mismatch");
    verify(notifications).create("owner", "media_rejected", "Media rejected",
        "The file does not match its photo format. Export it again as JPEG, PNG, or WebP and retry.",
        Map.of("mediaId", "media", "reasonCode", "technical_photo_format_mismatch"));
  }

  @Test
  void reschedulesUnavailableScannerWithoutRejectingOrNotifying() throws Exception {
    var repository = mock(MediaAssetRepository.class);
    var scanner = mock(ClamAvMediaScanner.class);
    var notifications = mock(NotificationService.class);
    var service = new MediaAutomatedModerationWorker(repository, mock(AuditService.class), new ObjectMapper(),
        properties(), mock(org.springframework.transaction.PlatformTransactionManager.class), scanner, notifications);
    var asset = Map.<String, Object>of("ownerUserId", "owner");
    when(repository.claimNextAutomatedJob()).thenReturn(
        Map.of("id", "job", "mediaId", "media", "stage", "ai_review", "leaseToken", "lease", "attempts", 2));
    when(repository.findAiMedia("media")).thenReturn(asset);
    when(repository.lockScreeningLease("job", "lease")).thenReturn("job");
    when(scanner.scan(asset)).thenThrow(new java.io.IOException("timeout"));

    assertThat(service.processNext().errors()).isEqualTo(1);
    verify(repository).retryScreening("job", 5);
    verifyNoInteractions(notifications);
  }

  @Test
  void returnsSafeRejectionCopyForTheOwner() {
    var asset = MediaService.mediaAssetRecord(Map.of("state", "rejected", "rejectionReasonCode", "malware_detected"));
    assertThat(asset.rejectionReasonCode()).isEqualTo("malware_detected");
    assertThat(asset.rejectionMessage()).contains("failed the security scan");
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
  void returnsModerationDetailsWithPreviewUrlNamesExpectedByAdminClient() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), storage);
    when(repository.findModerationMedia("media")).thenReturn(Map.of("bucketName", "quarantine", "objectKey", "file"));
    when(repository.listModerationJobs("media")).thenReturn(List.of());
    when(storage.presignedGet("quarantine", "file")).thenReturn(
        new StorageService.PresignedGetTicket("signed", "expires"));

    MediaModerationService.ModerationMedia media = service.getModerationDetails("media").media();

    assertThat(media.previewUrl()).isEqualTo("signed");
    assertThat(media.previewUrlExpiresAt()).isEqualTo("expires");
  }

  @Test
  void moderationQueueClampsLimitAndRejectsUnknownFilters() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    MediaModerationService service = service(repository, mock(NotificationService.class),
        mock(AuditService.class), mock(StorageService.class));
    when(repository.listModerationQueue("human_review", "pending", 100, "sample case", true)).thenReturn(List.of());

    assertThat(service.listModerationQueue("human_review", "pending", 999, " Sample Case ", true)).isEmpty();
    verify(repository).listModerationQueue("human_review", "pending", 100, "sample case", true);
    assertThatThrownBy(() -> service.listModerationQueue("manual", "pending", 10, "", false))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported moderation stage: manual");
    assertThatThrownBy(() -> service.listModerationQueue("human_review", "done", 10, "", false))
        .isInstanceOf(ApiException.class).hasMessage("Unsupported moderation status: done");
    assertThatThrownBy(() -> service.listModerationQueue(null, "pending", 10, "a".repeat(161), false))
        .isInstanceOf(ApiException.class).hasMessage("Search must be 160 characters or fewer");
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

    assertThat(service.reviewMedia("admin", "media", new MediaModerationService.ReviewMediaInput("approved", null, null))
        .ownerUserId()).isEqualTo("owner");
    verify(notifications).create(org.mockito.ArgumentMatchers.eq("owner"),
        org.mockito.ArgumentMatchers.eq("media_approved"), anyString(), anyString(), any());
    assertThatThrownBy(() -> service.reviewMedia("admin", "media",
        new MediaModerationService.ReviewMediaInput("perhaps", null, null)))
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

    assertThatThrownBy(() -> service.reviewMedia("admin", "media",
        new MediaModerationService.ReviewMediaInput("approved", null, null)))
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

    MediaModerationService.ProcessModerationResult result =
        service.processPendingJobs("admin", new MediaModerationService.ProcessModerationInput(10));
    assertThat(result.selected()).isEqualTo(1);
    assertThat(result.processed()).isEqualTo(1);
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

  @SuppressWarnings("unchecked")
  private Map<String, Object> repositoryRow(Map<String, Object> fields) {
    return mock(Map.class, org.mockito.AdditionalAnswers.delegatesTo(fields));
  }

  private MediaAutomatedModerationWorker worker(MediaAssetRepository repository, AuditService audit) {
    return new MediaAutomatedModerationWorker(repository, audit, new ObjectMapper(), properties(),
        mock(org.springframework.transaction.PlatformTransactionManager.class),
        new ClamAvMediaScanner(mock(StorageService.class), "", 3310, new PhotoContentScanner("", new VisualContentScanner("")), mock(VideoContentScanner.class)), mock(NotificationService.class));
  }
}
