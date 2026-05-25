package com.illamhelp.api.media;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "media_assets")
public class MediaAssetEntity {
  @Id
  private UUID id;

  @Column(name = "owner_user_id")
  private UUID ownerUserId;

  @Column(name = "job_id")
  private UUID jobId;

  private String kind;

  @Column(name = "bucket_name")
  private String bucketName;

  @Column(name = "object_key")
  private String objectKey;

  @Column(name = "content_type")
  private String contentType;

  @Column(name = "file_size_bytes")
  private Long fileSizeBytes;

  @Column(name = "checksum_sha256")
  private String checksumSha256;

  private String state;

  @Column(name = "created_at")
  private Instant createdAt;

  @Column(name = "updated_at")
  private Instant updatedAt;
}
