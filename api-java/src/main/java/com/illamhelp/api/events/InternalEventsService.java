package com.illamhelp.api.events;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class InternalEventsService {
  static final String MEDIA_UPLOAD_TICKET_ISSUED = "internal.media.upload_ticket_issued";
  static final String MEDIA_UPLOAD_COMPLETED = "internal.media.upload_completed";
  private static final String EVENT_VERSION = "v1";
  private static final String MEDIA_PROTO_SCHEMA = "proto/internal/events/v1/media_events.proto#";

  private final InternalEventOutboxRepository repository;

  public InternalEventsService(InternalEventOutboxRepository repository) {
    this.repository = repository;
  }

  public void mediaUploadTicketIssued(String actorUserId, String mediaId, String bucketName, String objectKey,
      String kind, String contentType, long fileSizeBytes, String checksumSha256) {
    Map<String, Object> payload = eventBase(actorUserId, mediaId);
    payload.put("bucketName", bucketName);
    payload.put("objectKey", objectKey);
    payload.put("kind", kind);
    payload.put("contentType", contentType);
    payload.put("fileSizeBytes", fileSizeBytes);
    payload.put("checksumSha256", checksumSha256);
    append(MEDIA_UPLOAD_TICKET_ISSUED, actorUserId, payload,
        InternalEventPayloadEncoder.mediaUploadTicketIssued(payload), "MediaUploadTicketIssuedEvent");
  }

  public void mediaUploadCompleted(String actorUserId, String mediaId, String etag, boolean verifiedByHead) {
    Map<String, Object> payload = eventBase(actorUserId, mediaId);
    payload.put("etag", etag == null ? "" : etag);
    payload.put("verifiedByHead", verifiedByHead);
    append(MEDIA_UPLOAD_COMPLETED, actorUserId, payload,
        InternalEventPayloadEncoder.mediaUploadCompleted(payload), "MediaUploadCompletedEvent");
  }

  private Map<String, Object> eventBase(String actorUserId, String mediaId) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("eventId", UUID.randomUUID().toString());
    payload.put("occurredAt", Instant.now().toString());
    payload.put("actorUserId", actorUserId);
    payload.put("mediaId", mediaId);
    return payload;
  }

  private void append(String eventName, String actorUserId, Map<String, Object> payload, byte[] protobuf, String schemaName) {
    repository.save(new InternalEventOutboxEntity(
        eventName,
        EVENT_VERSION,
        UUID.fromString(actorUserId),
        protobuf,
        payload,
        Map.of("contentType", "application/x-protobuf", "schema", MEDIA_PROTO_SCHEMA + schemaName)));
  }
}
