package com.illamhelp.api.media;

import static com.illamhelp.api.TestFixtures.jwt;
import static com.illamhelp.api.TestFixtures.properties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
    controller.mine(jwt("u"), null, null);
    controller.publicMedia("owner", null, null);
    controller.uploadTicket(jwt("u"), new MediaController.UploadTicketRequest(
        "image", "image/jpeg", 512, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "file.jpg", null));
    controller.complete(jwt("u"), "m", new MediaController.CompleteUploadRequest("abc"));
    verify(service).listMine("u", null, null);
    verify(service).listApprovedForOwner("owner", null, null);
    verify(service).uploadTicket(org.mockito.ArgumentMatchers.eq("u"), any());
    verify(service).complete("u", "m", "abc");
  }

  @Test
  void createsUploadTicketAndEnqueuesModeration() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    MediaMutationService mutations = mock(MediaMutationService.class);
    when(storage.presignedPut(anyString(), anyString(), anyString(), anyString())).thenReturn(Map.of("uploadUrl", "signed"));
    MediaService service = new MediaService(repository, properties(), storage, mutations, new ObjectMapper());

    Map<String, Object> response = service.uploadTicket("u", Map.of(
        "kind", "image", "contentType", "image/jpeg", "fileSizeBytes", 512, "checksumSha256", "hash"));

    assertThat(response).containsEntry("uploadUrl", "signed").containsEntry("bucketName", "quarantine");
    verify(mutations).recordUploadTicket(org.mockito.ArgumentMatchers.eq("u"), anyString(),
        org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.eq("image"),
        org.mockito.ArgumentMatchers.eq("quarantine"), anyString(), org.mockito.ArgumentMatchers.eq("image/jpeg"),
        org.mockito.ArgumentMatchers.eq(512L), org.mockito.ArgumentMatchers.eq("hash"), anyString());
  }

  @Test
  void signsApprovedPublicAssets() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    when(repository.findInternalUserIdByUsername("member")).thenReturn("owner");
    when(repository.listApprovedForOwner("owner", null, null, 51)).thenReturn(List.of(Map.of(
        "id", "m", "createdAt", "2026-05-26T10:00:00Z", "bucket_name", "approved", "object_key", "key")));
    when(storage.presignedGet("approved", "key")).thenReturn(Map.of("downloadUrl", "url"));
    MediaService service = new MediaService(repository, properties(), storage, mock(MediaMutationService.class), new ObjectMapper());

    @SuppressWarnings("unchecked")
    Map<String, Object> item = (Map<String, Object>) ((List<?>) service.listApprovedForOwner("member", null, null).get("items")).getFirst();
    assertThat(item).containsEntry("downloadUrl", "url").doesNotContainKey("bucket_name");
    verify(repository).listApprovedForOwner("owner", null, null, 51);
  }

  @Test
  void signsOnlyReturnedPublicMediaRowsWhenMorePagesExist() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    when(repository.findInternalUserIdByUsername("member")).thenReturn("owner");
    when(repository.listApprovedForOwner("owner", null, null, 2)).thenReturn(List.of(
        Map.of("id", "m1", "createdAt", "2026-05-26T10:00:00Z", "bucket_name", "approved", "object_key", "shown"),
        Map.of("id", "m2", "createdAt", "2026-05-26T09:00:00Z", "bucket_name", "approved", "object_key", "lookahead")));
    when(storage.presignedGet("approved", "shown")).thenReturn(Map.of("downloadUrl", "url"));
    MediaService service = new MediaService(repository, properties(), storage, mock(MediaMutationService.class), new ObjectMapper());

    Map<String, Object> page = service.listApprovedForOwner("member", 1, null);

    assertThat((List<?>) page.get("items")).hasSize(1);
    assertThat(page.get("nextCursor")).isNotNull();
    verify(storage).presignedGet("approved", "shown");
    verify(storage, never()).presignedGet("approved", "lookahead");
  }

  @Test
  void boundsPrivateMediaArrayResponses() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    when(repository.listMine("u", null, null, 51)).thenReturn(List.of(Map.of("id", "m", "createdAt", "2026-05-26T10:00:00Z")));
    MediaService service = new MediaService(repository, properties(), mock(StorageService.class), mock(MediaMutationService.class),
        new ObjectMapper());

    assertThat((List<?>) service.listMine("u", null, null).get("items")).hasSize(1);
    verify(repository).listMine("u", null, null, 51);
  }

  @Test
  void completingVerifiedUploadEmitsVerifiedOutboxEvent() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    MediaMutationService mutations = mock(MediaMutationService.class);
    when(repository.findOwnedAsset("u", "m")).thenReturn(Map.of("state", "uploaded", "bucketName", "quarantine",
        "objectKey", "u/m", "contentType", "image/jpeg", "fileSizeBytes", 512L, "checksumSha256", "hash"));
    when(storage.headObject("quarantine", "u/m"))
        .thenReturn(new StorageService.UploadedObject("image/jpeg", 512L, "hash", "\"ABC\""));
    when(mutations.recordVerifiedCompletion("u", "m", "abc")).thenReturn(Map.of("id", "m", "state", "scanning"));
    MediaService service = new MediaService(repository, properties(), storage, mutations, new ObjectMapper());

    assertThat(service.complete("u", "m", "abc")).containsEntry("state", "scanning");
    verify(mutations).recordVerifiedCompletion("u", "m", "abc");
  }

  @Test
  void rejectsCompletionWhenStoredChecksumDoesNotMatchUploadTicket() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    StorageService storage = mock(StorageService.class);
    MediaMutationService mutations = mock(MediaMutationService.class);
    when(repository.findOwnedAsset("u", "m")).thenReturn(Map.of("state", "uploaded", "bucketName", "quarantine",
        "objectKey", "u/m", "contentType", "image/jpeg", "fileSizeBytes", 512L, "checksumSha256", "expected"));
    when(storage.headObject("quarantine", "u/m"))
        .thenReturn(new StorageService.UploadedObject("image/jpeg", 512L, "wrong", "abc"));
    MediaService service = new MediaService(repository, properties(), storage, mutations, new ObjectMapper());

    assertThatThrownBy(() -> service.complete("u", "m", "abc"))
        .isInstanceOf(ApiException.class)
        .hasMessage("Uploaded object checksum metadata mismatch");
    verifyNoInteractions(mutations);
  }

  @Test
  void transactionalMediaMutationWritesAssetAuditAndOutboxTogether() {
    MediaAssetRepository repository = mock(MediaAssetRepository.class);
    AuditService audit = mock(AuditService.class);
    InternalEventsService events = mock(InternalEventsService.class);
    MediaMutationService service = new MediaMutationService(repository, audit, events);
    when(repository.completeUpload("u", "m")).thenReturn(Map.of("id", "m", "state", "scanning"));

    service.recordUploadTicket("u", "m", null, "image", "quarantine", "u/m", "image/jpeg", 512L, "hash", "{}");
    assertThat(service.recordVerifiedCompletion("u", "m", "etag")).containsEntry("state", "scanning");

    verify(repository).insertAsset("m", "u", null, "image", "quarantine", "u/m", "image/jpeg", 512L, "hash");
    verify(repository).enqueueTechnicalValidation("m", "{}");
    verify(events).mediaUploadTicketIssued("u", "m", "quarantine", "u/m", "image", "image/jpeg", 512L, "hash");
    verify(events).mediaUploadCompleted("u", "m", "etag", true);
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
