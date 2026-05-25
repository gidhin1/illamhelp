package com.illamhelp.api.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AuditServiceTest {
  @Test
  void savesTypedAuditEventWithSuppliedMetadata() {
    AuditEventRepository repository = mock(AuditEventRepository.class);
    AuditService service = new AuditService(repository);
    UUID actorId = UUID.randomUUID();
    UUID targetId = UUID.randomUUID();

    service.logEvent(actorId.toString(), targetId.toString(), "connection_requested", "matching", Map.of("connectionId", "c-1"));

    ArgumentCaptor<AuditEventEntity> saved = ArgumentCaptor.forClass(AuditEventEntity.class);
    verify(repository).save(saved.capture());
    assertThat(saved.getValue().getId()).isNotNull();
    assertThat(saved.getValue().getActorUserId()).isEqualTo(actorId);
    assertThat(saved.getValue().getTargetUserId()).isEqualTo(targetId);
    assertThat(saved.getValue().getEventType()).isEqualTo("connection_requested");
    assertThat(saved.getValue().getPurpose()).isEqualTo("matching");
    assertThat(saved.getValue().getMetadata()).containsEntry("connectionId", "c-1");
  }

  @Test
  void savesEmptyMetadataWhenCallerProvidesNone() {
    AuditEventRepository repository = mock(AuditEventRepository.class);
    AuditService service = new AuditService(repository);

    service.logEvent(null, null, "system_event", null, null);

    ArgumentCaptor<AuditEventEntity> saved = ArgumentCaptor.forClass(AuditEventEntity.class);
    verify(repository).save(saved.capture());
    assertThat(saved.getValue().getActorUserId()).isNull();
    assertThat(saved.getValue().getTargetUserId()).isNull();
    assertThat(saved.getValue().getMetadata()).isEmpty();
  }
}
