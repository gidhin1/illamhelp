package com.illamhelp.api.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity {
  @Id
  private UUID id;

  @Column(name = "role", nullable = false)
  private String role;

  @Column(name = "username", nullable = false)
  private String username;

  @Column(name = "email_masked")
  private String emailMasked;

  @Column(name = "phone_masked")
  private String phoneMasked;

  @Column(name = "created_at")
  private Instant createdAt;

  @Column(name = "updated_at")
  private Instant updatedAt;

  public UUID getId() {
    return id;
  }

  public String getRole() {
    return role;
  }

  public String getUsername() {
    return username;
  }
}
