package com.illamhelp.api.auth;

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
@Table(name = "policy_acceptances")
public class PolicyAcceptanceEntity {
  @Id
  private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "document_type", nullable = false)
  private String documentType;

  @Column(nullable = false)
  private String version;

  @Column(name = "accepted_at", nullable = false)
  private Instant acceptedAt;

  @Column(nullable = false)
  private String source;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false)
  private Map<String, Object> metadata;

  @Column(name = "created_at")
  private Instant createdAt;

  protected PolicyAcceptanceEntity() {
  }

  public PolicyAcceptanceEntity(UUID userId, String documentType, String version, Instant acceptedAt, String source,
      Map<String, Object> metadata) {
    this.id = UUID.randomUUID();
    this.userId = userId;
    this.documentType = documentType;
    this.version = version;
    this.acceptedAt = acceptedAt;
    this.source = source;
    this.metadata = metadata == null ? Map.of() : metadata;
    this.createdAt = Instant.now();
  }
}
