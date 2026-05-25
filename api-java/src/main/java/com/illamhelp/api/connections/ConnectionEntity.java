package com.illamhelp.api.connections;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "connections")
public class ConnectionEntity {
  @Id
  private UUID id;

  @Column(name = "user_a_id")
  private UUID userAId;

  @Column(name = "user_b_id")
  private UUID userBId;

  @Column(name = "requested_by_user_id")
  private UUID requestedByUserId;

  private String status;

  @Column(name = "requested_at")
  private Instant requestedAt;

  @Column(name = "decided_at")
  private Instant decidedAt;
}
