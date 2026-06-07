package com.illamhelp.api.media;

import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.common.AuthenticatedUser;
import com.illamhelp.api.common.CursorPages;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.storage.StorageService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
  private static final int MAX_ARRAY_RESULTS = 100;
  private final MediaAssetRepository mediaAssetRepository;
  private final AppProperties properties;
  private final StorageService storageService;
  private final MediaMutationService mediaMutationService;
  private final MediaAccessPolicy mediaAccessPolicy;
  private final ObjectMapper objectMapper;

  public MediaService(MediaAssetRepository mediaAssetRepository, AppProperties properties, StorageService storageService,
      MediaMutationService mediaMutationService, MediaAccessPolicy mediaAccessPolicy, ObjectMapper objectMapper) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.properties = properties;
    this.storageService = storageService;
    this.mediaMutationService = mediaMutationService;
    this.mediaAccessPolicy = mediaAccessPolicy;
    this.objectMapper = objectMapper;
  }

  public MediaPage<MediaAssetRecord> listMine(String userId, Integer limit, String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<Map<String, Object>> items = mediaAssetRepository.listMine(userId, cursor.createdAt(), cursor.id(), pageSize + 1);
    return mediaPage(items, pageSize, MediaService::mediaAssetRecord);
  }

  public MediaPage<PublicMediaRecord> listApprovedForOwner(String ownerUserId, Integer limit, String cursorValue) {
    String internalOwnerUserId = resolveInternalUserId(ownerUserId);
    AuthenticatedUser publicViewer = new AuthenticatedUser(internalOwnerUserId, ownerUserId, List.of(), "public", internalOwnerUserId);
    return listProfileMedia(publicViewer, internalOwnerUserId, limit, cursorValue);
  }

  public MediaPage<PublicMediaRecord> listProfileMedia(AuthenticatedUser viewer, String profileUserId, Integer limit,
      String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    String internalProfileUserId = resolveInternalUserId(profileUserId);
    mediaAccessPolicy.requireCanViewProfileMedia(viewer, internalProfileUserId);
    List<Map<String, Object>> rows = mediaAssetRepository.listApprovedForProfile(internalProfileUserId,
        cursor.createdAt(), cursor.id(), pageSize + 1);
    return downloadableMediaPage(rows, pageSize);
  }

  public MediaPage<PublicMediaRecord> listJobMedia(AuthenticatedUser viewer, String jobId, Integer limit,
      String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    mediaAccessPolicy.requireCanViewJobMedia(viewer, jobId);
    List<Map<String, Object>> rows = mediaAssetRepository.listApprovedForJob(jobId,
        cursor.createdAt(), cursor.id(), pageSize + 1);
    return downloadableMediaPage(rows, pageSize);
  }

  public MediaPage<MediaAssetRecord> listVerificationDocuments(String userId, Integer limit, String cursorValue) {
    int pageSize = pageSize(limit);
    CursorPages.Cursor cursor = CursorPages.decode(cursorValue);
    List<Map<String, Object>> items = mediaAssetRepository.listVerificationDocuments(userId,
        cursor.createdAt(), cursor.id(), pageSize + 1);
    return mediaPage(items, pageSize, MediaService::mediaAssetRecord);
  }

  private MediaPage<PublicMediaRecord> downloadableMediaPage(List<Map<String, Object>> rows, int pageSize) {
    Map<String, Object> page = CursorPages.response(rows, pageSize, "createdAt");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> pageItems = (List<Map<String, Object>>) page.get("items");
    List<PublicMediaRecord> items = pageItems.stream().map(row -> {
      StorageService.PresignedGetTicket signed =
          storageService.presignedGet(String.valueOf(row.get("bucketName")), String.valueOf(row.get("objectKey")));
      return new PublicMediaRecord(
          string(row, "id"),
          string(row, "ownerUserId"),
          string(row, "profileUserId"),
          string(row, "jobId"),
          string(row, "kind"),
          string(row, "purpose"),
          string(row, "contentType"),
          longValue(row, "fileSizeBytes"),
          string(row, "state"),
          string(row, "createdAt"),
          string(row, "updatedAt"),
          signed.downloadUrl(),
          signed.downloadUrlExpiresAt());
    }).toList();
    return new MediaPage<>(items, pageSize, (String) page.get("nextCursor"));
  }

  public UploadTicketResponse uploadTicket(String userId, UploadTicketInput body) {
    String mediaId = UUID.randomUUID().toString();
    String kind = body.kind();
    String contentType = body.contentType();
    String objectKey = userId + "/" + mediaId;
    String jobId = body.jobId();
    String purpose = normalizePurpose(body.purpose());
    String profileUserId = switch (purpose) {
      case "profile", "verification_document" -> userId;
      case "job" -> null;
      default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported media purpose: " + body.purpose());
    };
    if ("job".equals(purpose)) {
      mediaAccessPolicy.requireCanAttachJobMedia(userId, jobId);
    } else if (jobId != null && !jobId.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "jobId is only supported for job media");
    }
    Long fileSizeBytes = body.fileSizeBytes();
    String checksumSha256 = body.checksumSha256();
    StorageService.PresignedPutTicket signed = storageService.presignedPut(properties.minioQuarantineBucket(), objectKey, contentType,
        checksumSha256 == null ? "" : checksumSha256);
    mediaMutationService.recordUploadTicket(userId, mediaId, profileUserId, jobId, purpose, kind, properties.minioQuarantineBucket(),
        objectKey, contentType, fileSizeBytes, checksumSha256, json(Map.of(
            "source", "upload_ticket",
            "purpose", purpose,
            "expectedContentType", contentType,
            "expectedSize", body.fileSizeBytes())));
    return new UploadTicketResponse(
        signed.uploadUrl(),
        signed.expiresAt(),
        signed.requiredHeaders(),
        mediaId,
        properties.minioQuarantineBucket(),
        objectKey);
  }

  public MediaAssetRecord complete(String userId, String mediaId, String etag) {
    Map<String, Object> existing = mediaAssetRepository.findOwnedAsset(userId, mediaId);
    if (existing == null || existing.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Media asset not found");
    }
    if (!"uploaded".equals(String.valueOf(existing.get("state")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST,
          "Media asset cannot be completed from state '" + existing.get("state") + "'");
    }
    StorageService.UploadedObject uploaded;
    try {
      uploaded = storageService.headObject(String.valueOf(existing.get("bucketName")), String.valueOf(existing.get("objectKey")));
    } catch (RuntimeException exception) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Failed to verify uploaded object in storage");
    }
    verifyUpload(existing, uploaded, etag);
    String normalizedEtag = normalizeEtag(etag);
    return mediaMutationService.recordVerifiedCompletion(userId, mediaId, normalizedEtag);
  }

  private static <T> MediaPage<T> mediaPage(List<Map<String, Object>> rows, int pageSize,
      Function<Map<String, Object>, T> mapper) {
    Map<String, Object> page = CursorPages.response(rows, pageSize, "createdAt");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> pageItems = (List<Map<String, Object>>) page.get("items");
    return new MediaPage<>(pageItems.stream().map(mapper).toList(), pageSize, (String) page.get("nextCursor"));
  }

  static MediaAssetRecord mediaAssetRecord(Map<String, Object> row) {
    return new MediaAssetRecord(
        string(row, "id"),
        string(row, "ownerUserId"),
        string(row, "profileUserId"),
        string(row, "jobId"),
        string(row, "kind"),
        string(row, "purpose"),
        string(row, "bucketName"),
        string(row, "objectKey"),
        string(row, "contentType"),
        longValue(row, "fileSizeBytes"),
        string(row, "checksumSha256"),
        string(row, "state"),
        string(row, "createdAt"),
        string(row, "updatedAt"));
  }

  private void verifyUpload(Map<String, Object> expected, StorageService.UploadedObject uploaded, String suppliedEtag) {
    String expectedContentType = String.valueOf(expected.get("contentType")).toLowerCase();
    String actualContentType = uploaded.contentType() == null ? null : uploaded.contentType().split(";")[0].trim().toLowerCase();
    if (!expectedContentType.equals(actualContentType)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded object content type mismatch");
    }
    long expectedSize = ((Number) expected.get("fileSizeBytes")).longValue();
    if (uploaded.contentLength() == null || expectedSize != uploaded.contentLength()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded object size mismatch");
    }
    if (!String.valueOf(expected.get("checksumSha256")).equalsIgnoreCase(String.valueOf(uploaded.checksumSha256()))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded object checksum metadata mismatch");
    }
    String expectedEtag = normalizeEtag(suppliedEtag);
    String actualEtag = normalizeEtag(uploaded.etag());
    if (expectedEtag != null && actualEtag != null && !expectedEtag.equals(actualEtag)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded object etag mismatch");
    }
  }

  private String normalizeEtag(String etag) {
    return etag == null || etag.isBlank() ? null : etag.replace("\"", "").trim().toLowerCase();
  }

  private String resolveInternalUserId(String identifier) {
    if (identifier != null && identifier.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) {
      return identifier;
    }
    return mediaAssetRepository.findInternalUserIdByUsername(identifier);
  }

  private int pageSize(Integer limit) {
    return limit == null ? 50 : Math.max(1, Math.min(limit, MAX_ARRAY_RESULTS));
  }

  private String normalizePurpose(String purpose) {
    if (purpose == null || purpose.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Media purpose is required");
    }
    return purpose.trim().toLowerCase();
  }

  private String json(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }

  static String string(Map<String, Object> row, String key) {
    Object value = row.get(key);
    return value == null ? null : String.valueOf(value);
  }

  static Long longValue(Map<String, Object> row, String key) {
    Object value = row.get(key);
    if (value == null) {
      return null;
    }
    return value instanceof Number number ? number.longValue() : Long.valueOf(String.valueOf(value));
  }

  public record MediaPage<T>(List<T> items, int limit, String nextCursor) {
  }

  public record MediaAssetRecord(String id, String ownerUserId, String profileUserId, String jobId, String kind,
      String purpose, String bucketName, String objectKey, String contentType, Long fileSizeBytes,
      String checksumSha256, String state, String createdAt, String updatedAt) {
  }

  public record PublicMediaRecord(String id, String ownerUserId, String profileUserId, String jobId, String kind,
      String purpose, String contentType, Long fileSizeBytes, String state, String createdAt, String updatedAt,
      String downloadUrl, String downloadUrlExpiresAt) {
  }

  public record UploadTicketInput(String kind, String contentType, Long fileSizeBytes, String checksumSha256,
      String originalFileName, String jobId, String purpose) {
  }

  public record UploadTicketResponse(String uploadUrl, String expiresAt, Map<String, String> requiredHeaders,
      String mediaId, String bucketName, String objectKey) {
  }
}
