package com.illamhelp.api.jobs;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "jobs")
public class JobEntity {
  @Id
  private UUID id;

  @Column(name = "seeker_user_id")
  private UUID seekerUserId;

  private String category;
  private String title;
  private String description;

  @Column(name = "location_text")
  private String locationText;

  @Column(name = "location_latitude")
  private Double locationLatitude;

  @Column(name = "location_longitude")
  private Double locationLongitude;

  private String status;
  private String visibility;

  @Column(name = "assigned_provider_user_id")
  private UUID assignedProviderUserId;

  @Column(name = "accepted_application_id")
  private UUID acceptedApplicationId;

  @Column(name = "created_at")
  private Instant createdAt;

  @Column(name = "updated_at")
  private Instant updatedAt;
}
