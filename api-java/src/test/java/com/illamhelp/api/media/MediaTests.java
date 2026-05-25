package com.illamhelp.api.media;

import static com.illamhelp.api.TestFixtures.jwt;
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
import com.illamhelp.api.events.InternalEventsService;
import com.illamhelp.api.storage.StorageService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MediaTests {
  @Test
  void controllerDelegatesPublicAndAuthenticatedMediaCalls() {
    MediaService service = mock(MediaService.class);
    MediaController controller = new MediaController(service);
    controller.mine(jwt("u"));
    controller.publicMedia("owner");
    controller.uploadTicket(jwt("u"), new MediaController.UploadTicketRequest(
        "image", "image/jpeg", 512, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "file.jpg", null));
    controller.complete(jwt("u"), "m", new MediaController.CompleteUploadRequest("abc"));
    verify(service).listMine("u");
    verify(service).listApprovedForOwner("owner");
    verify(service).uploadTicket(org.mockito.ArgumentMatchers.eq("u"), any());
    verify(service).complete("u", "m", "abc");
  }

  @Test
  void createsUploadTicketAndEnqueuesModeration() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    AuditService audit = mock(AuditService.class);
    InternalEventsService events = mock(InternalEventsService.class);
    when(storage.presignedPut(anyString(), anyString(), anyString(), anyString())).thenReturn(Map.of("uploadUrl", "signed"));
    MediaService service = new MediaService(repository, properties(), storage, audit, events, new ObjectMapper());

    Map<String, Object> response = service.uploadTicket("u", Map.of(
        "kind", "image", "contentType", "image/jpeg", "fileSizeBytes", 512, "checksumSha256", "hash"));

    assertThat(response).containsEntry("uploadUrl", "signed").containsEntry("bucketName", "quarantine");
    verify(repository).insertAsset(anyString(), org.mockito.ArgumentMatchers.eq("u"), org.mockito.ArgumentMatchers.isNull(),
        org.mockito.ArgumentMatchers.eq("image"), org.mockito.ArgumentMatchers.eq("quarantine"), anyString(),
        org.mockito.ArgumentMatchers.eq("image/jpeg"), org.mockito.ArgumentMatchers.eq(512L), org.mockito.ArgumentMatchers.eq("hash"));
    verify(repository).enqueueTechnicalValidation(anyString(), anyString());
    verify(audit).logEvent(org.mockito.ArgumentMatchers.eq("u"), org.mockito.ArgumentMatchers.isNull(),
        org.mockito.ArgumentMatchers.eq("media_upload_ticket_created"), org.mockito.ArgumentMatchers.isNull(), any());
    verify(events).mediaUploadTicketIssued(org.mockito.ArgumentMatchers.eq("u"), anyString(),
        org.mockito.ArgumentMatchers.eq("quarantine"), anyString(), org.mockito.ArgumentMatchers.eq("image"),
        org.mockito.ArgumentMatchers.eq("image/jpeg"), org.mockito.ArgumentMatchers.eq(512L), org.mockito.ArgumentMatchers.eq("hash"));
  }

  @Test
  void signsApprovedPublicAssets() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    when(repository.findInternalUserIdByUsername("member")).thenReturn("owner");
    when(repository.listApprovedForOwner("owner")).thenReturn(List.of(Map.of("bucket_name", "approved", "object_key", "key")));
    when(storage.presignedGet("approved", "key")).thenReturn(Map.of("downloadUrl", "url"));
    MediaService service = new MediaService(repository, properties(), storage, mock(AuditService.class),
        mock(InternalEventsService.class), new ObjectMapper());

    assertThat(service.listApprovedForOwner("member").getFirst()).containsEntry("downloadUrl", "url").doesNotContainKey("bucket_name");
  }

  @Test
  void completingVerifiedUploadEmitsVerifiedOutboxEvent() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    InternalEventsService events = mock(InternalEventsService.class);
    when(repository.findOwnedAsset("u", "m")).thenReturn(Map.of("state", "uploaded", "bucketName", "quarantine",
        "objectKey", "u/m", "contentType", "image/jpeg", "fileSizeBytes", 512L, "checksumSha256", "hash"));
    when(storage.headObject("quarantine", "u/m"))
        .thenReturn(new StorageService.UploadedObject("image/jpeg", 512L, "hash", "\"ABC\""));
    when(repository.completeUpload("u", "m")).thenReturn(Map.of("id", "m", "state", "scanning"));
    MediaService service = new MediaService(repository, properties(), storage, mock(AuditService.class),
        events, new ObjectMapper());

    assertThat(service.complete("u", "m", "abc")).containsEntry("state", "scanning");
    verify(events).mediaUploadCompleted("u", "m", "abc", true);
  }

  @Test
  void rejectsCompletionWhenStoredChecksumDoesNotMatchUploadTicket() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    when(repository.findOwnedAsset("u", "m")).thenReturn(Map.of("state", "uploaded", "bucketName", "quarantine",
        "objectKey", "u/m", "contentType", "image/jpeg", "fileSizeBytes", 512L, "checksumSha256", "expected"));
    when(storage.headObject("quarantine", "u/m"))
        .thenReturn(new StorageService.UploadedObject("image/jpeg", 512L, "wrong", "abc"));
    MediaService service = new MediaService(repository, properties(), storage, mock(AuditService.class),
        mock(InternalEventsService.class), new ObjectMapper());

    assertThatThrownBy(() -> service.complete("u", "m", "abc"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Uploaded object checksum metadata mismatch");
    verify(repository, org.mockito.Mockito.never()).completeUpload(anyString(), anyString());
  }

  @Test
  void adminControllerDelegatesModerationCalls() {
    MediaModerationService service = mock(MediaModerationService.class);
    AdminMediaController controller = new AdminMediaController(service);
    when(service.listModerationQueue(null, null, 50)).thenReturn(List.of());
    when(service.getModerationDetails("media")).thenReturn(Map.of("media", Map.of()));
    when(service.processPendingJobs("admin", null)).thenReturn(Map.of("processed", 1));
    when(service.reviewMedia(org.mockito.ArgumentMatchers.eq("admin"), org.mockito.ArgumentMatchers.eq("media"), any()))
        .thenReturn(Map.of("ownerUserId", "owner"));

    assertThat(controller.queue(new AdminMediaController.ModerationQueueRequest(null, null, 50))).isEmpty();
    assertThat(controller.details("media")).containsKey("media");
    assertThat(controller.process(jwt("admin"), null)).containsEntry("processed", 1);
    assertThat(controller.review(jwt("admin"), "media", new AdminMediaController.ReviewMediaRequest("approved", null, null)))
        .containsEntry("ownerUserId", "owner");
    verify(service).processPendingJobs("admin", null);
    verify(service).reviewMedia(org.mockito.ArgumentMatchers.eq("admin"), org.mockito.ArgumentMatchers.eq("media"), any());
  }
}
