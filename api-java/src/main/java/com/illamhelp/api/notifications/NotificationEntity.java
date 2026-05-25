package com.illamhelp.api.notifications;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "notifications")
public class NotificationEntity {
  @Id
  private UUID id;

  @Column(name = "user_id")
  private UUID userId;

  private String type;
  private String title;
  private String body;
  private boolean read;

  @JdbcTypeCode(SqlTypes.JSON)
  private String data;

  @Column(name = "read_at")
  private Instant readAt;

  @Column(name = "created_at")
  private Instant createdAt;
}
