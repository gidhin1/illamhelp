package com.illamhelp.api.consent;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "pii_consent_grants")
public class ConsentGrantEntity {
  @Id
  private UUID id;

  protected ConsentGrantEntity() {
  }
}
