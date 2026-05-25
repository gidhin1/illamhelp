package com.illamhelp.api.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class InternalEventsServiceTest {
  private static final String ACTOR_ID = "45709adc-c419-489e-922e-9bbb69bb4672";

  @Test
  void storesMediaTicketAsPendingOutboxEnvelope() {
    InternalEventOutboxRepository repository = mock(InternalEventOutboxRepository.class);
    InternalEventsService service = new InternalEventsService(repository);

    service.mediaUploadTicketIssued(ACTOR_ID, "media", "quarantine", "actor/media", "image", "image/jpeg", 512L, "digest");

    ArgumentCaptor<InternalEventOutboxEntity> saved = ArgumentCaptor.forClass(InternalEventOutboxEntity.class);
    verify(repository).save(saved.capture());
    InternalEventOutboxEntity event = saved.getValue();
    assertThat(event.getEventName()).isEqualTo("internal.media.upload_ticket_issued");
    assertThat(event.getEventVersion()).isEqualTo("v1");
    assertThat(event.getActorUserId()).isEqualTo(UUID.fromString(ACTOR_ID));
    assertThat(event.getStatus()).isEqualTo("pending");
    assertThat(event.getPayloadJson()).containsEntry("mediaId", "media").containsEntry("fileSizeBytes", 512L);
    assertThat(event.getHeaders()).containsEntry("contentType", "application/x-protobuf");
    assertThat(event.getPayloadProtobuf()).isNotEmpty();
  }

  @Test
  void completionPayloadRecordsStorageVerificationTruthfully() {
    InternalEventOutboxRepository repository = mock(InternalEventOutboxRepository.class);
    InternalEventsService service = new InternalEventsService(repository);

    service.mediaUploadCompleted(ACTOR_ID, "media", "etag", true);

    ArgumentCaptor<InternalEventOutboxEntity> saved = ArgumentCaptor.forClass(InternalEventOutboxEntity.class);
    verify(repository).save(saved.capture());
    Map<String, Object> payload = saved.getValue().getPayloadJson();
    assertThat(payload).containsEntry("mediaId", "media").containsEntry("etag", "etag").containsEntry("verifiedByHead", true);
    assertThat(saved.getValue().getPayloadProtobuf()).contains((byte) 0x30, (byte) 0x01);
  }
}
