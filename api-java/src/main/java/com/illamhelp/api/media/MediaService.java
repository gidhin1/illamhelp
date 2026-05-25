package com.illamhelp.api.media;

import com.illamhelp.api.audit.AuditService;
import com.illamhelp.api.common.ApiException;
import com.illamhelp.api.config.AppProperties;
import com.illamhelp.api.events.InternalEventsService;
import com.illamhelp.api.storage.StorageService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaService {
  private final MediaAssetRepository mediaAssetRepository;
  private final AppProperties properties;
  private final StorageService storageService;
  private final AuditService auditService;
  private final InternalEventsService internalEventsService;
  private final ObjectMapper objectMapper;

  public MediaService(MediaAssetRepository mediaAssetRepository, AppProperties properties, StorageService storageService,
      AuditService auditService, InternalEventsService internalEventsService, ObjectMapper objectMapper) {
    this.mediaAssetRepository = mediaAssetRepository;
    this.properties = properties;
    this.storageService = storageService;
    this.auditService = auditService;
    this.internalEventsService = internalEventsService;
    this.objectMapper = objectMapper;
  }

  public List<Map<String, Object>> listMine(String userId) {
    return mediaAssetRepository.listMine(userId);
  }

  public List<Map<String, Object>> listApprovedForOwner(String ownerUserId) {
    String internalOwnerUserId = resolveInternalUserId(ownerUserId);
    List<Map<String, Object>> rows = mediaAssetRepository.listApprovedForOwner(internalOwnerUserId);
    return rows.stream().map(row -> {
      Map<String, Object> signed = storageService.presignedGet(String.valueOf(row.get("bucket_name")), String.valueOf(row.get("object_key")));
      Map<String, Object> out = new HashMap<>(row);
      out.remove("bucket_name");
      out.remove("object_key");
      out.putAll(signed);
      return out;
    }).toList();
  }

  @Transactional
  public Map<String, Object> uploadTicket(String userId, Map<String, Object> body) {
    String mediaId = UUID.randomUUID().toString();
    String kind = String.valueOf(body.get("kind"));
    String contentType = String.valueOf(body.get("contentType"));
    String objectKey = userId + "/" + mediaId;
    String jobId = body.get("jobId") == null ? null : String.valueOf(body.get("jobId"));
    Long fileSizeBytes = body.get("fileSizeBytes") instanceof Number number ? number.longValue() : null;
    String checksumSha256 = body.get("checksumSha256") == null ? null : String.valueOf(body.get("checksumSha256"));
    mediaAssetRepository.insertAsset(mediaId, userId, jobId, kind, properties.minioQuarantineBucket(),
        objectKey, contentType, fileSizeBytes, checksumSha256);
    mediaAssetRepository.enqueueTechnicalValidation(mediaId, json(Map.of(
            "source", "upload_ticket",
            "expectedContentType", contentType,
            "expectedSize", body.get("fileSizeBytes"))));
    auditService.logEvent(userId, null, "media_upload_ticket_created", null, Map.of("mediaId", mediaId, "kind", kind));
    internalEventsService.mediaUploadTicketIssued(userId, mediaId, properties.minioQuarantineBucket(), objectKey,
        kind, contentType, fileSizeBytes == null ? 0 : fileSizeBytes, checksumSha256 == null ? "" : checksumSha256);
    Map<String, Object> signed = storageService.presignedPut(properties.minioQuarantineBucket(), objectKey, contentType,
        checksumSha256 == null ? "" : checksumSha256);
    Map<String, Object> response = new HashMap<>(signed);
    response.put("mediaId", mediaId);
    response.put("bucketName", properties.minioQuarantineBucket());
    response.put("objectKey", objectKey);
    return response;
  }

  @Transactional
  public Map<String, Object> complete(String userId, String mediaId, String etag) {
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
    Map<String, Object> asset = mediaAssetRepository.completeUpload(userId, mediaId);
    String normalizedEtag = normalizeEtag(etag);
    auditService.logEvent(userId, null, "media_upload_completed", null,
        Map.of("mediaId", mediaId, "verifiedByHead", true));
    internalEventsService.mediaUploadCompleted(userId, mediaId, normalizedEtag, true);
    return asset;
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

  private String json(Map<String, Object> value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      return "{}";
    }
  }
}
