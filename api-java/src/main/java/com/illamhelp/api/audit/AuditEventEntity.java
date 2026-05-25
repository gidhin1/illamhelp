package com.illamhelp.api.audit;

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
@Table(name = "audit_events")
public class AuditEventEntity {
  @Id
  private UUID id;

  @Column(name = "actor_user_id")
  private UUID actorUserId;

  @Column(name = "target_user_id")
  private UUID targetUserId;

  @Column(name = "event_type", nullable = false)
  private String eventType;

  private String purpose;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false)
  private Map<String, Object> metadata;

  @Column(name = "created_at")
  private Instant createdAt;

  protected AuditEventEntity() {
  }

  public AuditEventEntity(UUID actorUserId, UUID targetUserId, String eventType, String purpose, Map<String, Object> metadata) {
    this.id = UUID.randomUUID();
    this.actorUserId = actorUserId;
    this.targetUserId = targetUserId;
    this.eventType = eventType;
    this.purpose = purpose;
    this.metadata = metadata;
    this.createdAt = Instant.now();
  }

  UUID getId() {
    return id;
  }

  UUID getActorUserId() {
    return actorUserId;
  }

  UUID getTargetUserId() {
    return targetUserId;
  }

  String getEventType() {
    return eventType;
  }

  String getPurpose() {
    return purpose;
  }

  Map<String, Object> getMetadata() {
    return metadata;
  }
}
