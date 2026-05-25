package com.illamhelp.api.profiles;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "verification_requests")
public class VerificationRequestEntity {
  @Id
  private UUID id;

  protected VerificationRequestEntity() {
  }
}
