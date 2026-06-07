package com.illamhelp.api.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.proto.media.v1.DownloadableMedia;
import com.illamhelp.api.proto.media.v1.MediaAsset;
import com.illamhelp.api.proto.media.v1.MediaKind;
import com.illamhelp.api.proto.media.v1.MediaPurpose;
import com.illamhelp.api.proto.media.v1.MediaState;
import io.grpc.Status;
import java.lang.reflect.Array;
import org.springframework.http.HttpStatus;

final class GrpcMediaMappers {
  private GrpcMediaMappers() {
  }

  static MediaAsset mediaAsset(MediaService.MediaAssetRecord record) {
    return MediaAsset.newBuilder()
        .setId(value(record.id()))
        .setOwnerUserId(value(record.ownerUserId()))
        .setProfileUserId(value(record.profileUserId()))
        .setJobId(value(record.jobId()))
        .setKind(kind(record.kind()))
        .setPurpose(purpose(record.purpose()))
        .setBucketName(value(record.bucketName()))
        .setObjectKey(value(record.objectKey()))
        .setContentType(value(record.contentType()))
        .setFileSizeBytes(record.fileSizeBytes() == null ? 0 : record.fileSizeBytes())
        .setChecksumSha256(value(record.checksumSha256()))
        .setState(state(record.state()))
        .setCreatedAt(value(record.createdAt()))
        .setUpdatedAt(value(record.updatedAt()))
        .build();
  }

  static DownloadableMedia downloadableMedia(MediaService.PublicMediaRecord record) {
    return DownloadableMedia.newBuilder()
        .setId(value(record.id()))
        .setOwnerUserId(value(record.ownerUserId()))
        .setProfileUserId(value(record.profileUserId()))
        .setJobId(value(record.jobId()))
        .setKind(kind(record.kind()))
        .setPurpose(purpose(record.purpose()))
        .setContentType(value(record.contentType()))
        .setFileSizeBytes(record.fileSizeBytes() == null ? 0 : record.fileSizeBytes())
        .setState(state(record.state()))
        .setCreatedAt(value(record.createdAt()))
        .setUpdatedAt(value(record.updatedAt()))
        .setDownloadUrl(value(record.downloadUrl()))
        .setDownloadUrlExpiresAt(value(record.downloadUrlExpiresAt()))
        .build();
  }

  static MediaKind kind(String value) {
    return switch (value == null ? "" : value) {
      case "image" -> MediaKind.MEDIA_KIND_IMAGE;
      case "video" -> MediaKind.MEDIA_KIND_VIDEO;
      default -> MediaKind.MEDIA_KIND_UNSPECIFIED;
    };
  }

  static String kind(MediaKind value) {
    return switch (value) {
      case MEDIA_KIND_IMAGE -> "image";
      case MEDIA_KIND_VIDEO -> "video";
      default -> null;
    };
  }

  static MediaPurpose purpose(String value) {
    return switch (value == null ? "" : value) {
      case "profile" -> MediaPurpose.MEDIA_PURPOSE_PROFILE;
      case "job" -> MediaPurpose.MEDIA_PURPOSE_JOB;
      case "verification_document" -> MediaPurpose.MEDIA_PURPOSE_VERIFICATION_DOCUMENT;
      default -> MediaPurpose.MEDIA_PURPOSE_UNSPECIFIED;
    };
  }

  static String purpose(MediaPurpose value) {
    return switch (value) {
      case MEDIA_PURPOSE_PROFILE -> "profile";
      case MEDIA_PURPOSE_JOB -> "job";
      case MEDIA_PURPOSE_VERIFICATION_DOCUMENT -> "verification_document";
      default -> null;
    };
  }

  static MediaState state(String value) {
    return switch (value == null ? "" : value) {
      case "uploaded" -> MediaState.MEDIA_STATE_UPLOADED;
      case "scanning" -> MediaState.MEDIA_STATE_SCANNING;
      case "ai_reviewed" -> MediaState.MEDIA_STATE_AI_REVIEWED;
      case "human_review_pending" -> MediaState.MEDIA_STATE_HUMAN_REVIEW_PENDING;
      case "approved" -> MediaState.MEDIA_STATE_APPROVED;
      case "rejected" -> MediaState.MEDIA_STATE_REJECTED;
      case "appeal_pending" -> MediaState.MEDIA_STATE_APPEAL_PENDING;
      case "appeal_resolved" -> MediaState.MEDIA_STATE_APPEAL_RESOLVED;
      default -> MediaState.MEDIA_STATE_UNSPECIFIED;
    };
  }

  static String json(ObjectMapper objectMapper, Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof String string) {
      return string;
    }
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      return String.valueOf(value);
    }
  }

  static Iterable<String> strings(Object value) {
    java.util.ArrayList<String> values = new java.util.ArrayList<>();
    if (value == null) {
      return values;
    }
    if (value instanceof Iterable<?> iterable) {
      for (Object item : iterable) {
        values.add(String.valueOf(item));
      }
      return values;
    }
    if (value.getClass().isArray()) {
      int length = Array.getLength(value);
      for (int i = 0; i < length; i++) {
        values.add(String.valueOf(Array.get(value, i)));
      }
      return values;
    }
    values.add(String.valueOf(value));
    return values;
  }

  static RuntimeException status(Throwable throwable) {
    if (throwable instanceof io.grpc.StatusRuntimeException grpc) {
      return grpc;
    }
    if (throwable instanceof ApiException api) {
      return status(api.status()).withDescription(api.getMessage()).asRuntimeException();
    }
    return Status.INTERNAL.withDescription(throwable.getMessage()).asRuntimeException();
  }

  private static Status status(HttpStatus httpStatus) {
    return switch (httpStatus) {
      case BAD_REQUEST -> Status.INVALID_ARGUMENT;
      case UNAUTHORIZED -> Status.UNAUTHENTICATED;
      case FORBIDDEN -> Status.PERMISSION_DENIED;
      case NOT_FOUND -> Status.NOT_FOUND;
      case CONFLICT -> Status.ALREADY_EXISTS;
      case BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT -> Status.UNAVAILABLE;
      default -> Status.INTERNAL;
    };
  }

  static String value(String value) {
    return value == null ? "" : value;
  }
}
