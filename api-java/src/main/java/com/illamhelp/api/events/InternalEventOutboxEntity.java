package com.illamhelp.api.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "internal_event_outbox")
public class InternalEventOutboxEntity {
  @Id
  private UUID id;

  @Column(name = "event_name", nullable = false)
  private String eventName;

  @Column(name = "event_version", nullable = false)
  private String eventVersion;

  @Column(name = "actor_user_id")
  private UUID actorUserId;

  @Column(name = "payload_protobuf", nullable = false)
  private byte[] payloadProtobuf;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "payload_json", nullable = false)
  private Map<String, Object> payloadJson;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false)
  private Map<String, Object> headers;

  @Column(nullable = false)
  private String status;

  @Column(name = "attempt_count", nullable = false)
  private int attemptCount;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected InternalEventOutboxEntity() {
  }

  InternalEventOutboxEntity(String eventName, String eventVersion, UUID actorUserId, byte[] payloadProtobuf,
      Map<String, Object> payloadJson, Map<String, Object> headers) {
    this.id = UUID.randomUUID();
    this.eventName = eventName;
    this.eventVersion = eventVersion;
    this.actorUserId = actorUserId;
    this.payloadProtobuf = payloadProtobuf;
    this.payloadJson = payloadJson;
    this.headers = headers;
    this.status = "pending";
    this.attemptCount = 0;
    this.createdAt = Instant.now();
  }

  UUID getId() {
    return id;
  }

  String getEventName() {
    return eventName;
  }

  String getEventVersion() {
    return eventVersion;
  }

  UUID getActorUserId() {
    return actorUserId;
  }

  byte[] getPayloadProtobuf() {
    return payloadProtobuf;
  }

  Map<String, Object> getPayloadJson() {
    return payloadJson;
  }

  Map<String, Object> getHeaders() {
    return headers;
  }

  String getStatus() {
    return status;
  }
}
