package com.illamhelp.api.profiles;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "profiles")
public class ProfileEntity {
  @Id
  private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "first_name", nullable = false)
  private String firstName;

  @Column(name = "last_name")
  private String lastName;

  private String city;
  private String area;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "service_categories")
  private String[] serviceCategories;

  @Column(name = "rating_average")
  private BigDecimal ratingAverage;

  @Column(name = "rating_count")
  private Integer ratingCount;

  @Column(name = "created_at")
  private Instant createdAt;

  @Column(name = "updated_at")
  private Instant updatedAt;
}
