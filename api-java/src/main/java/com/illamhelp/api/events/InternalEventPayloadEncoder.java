package com.illamhelp.api.events;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

final class InternalEventPayloadEncoder {
  private InternalEventPayloadEncoder() {
  }

  static byte[] mediaUploadTicketIssued(Map<String, Object> payload) {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    writeString(output, 1, payload.get("eventId"));
    writeString(output, 2, payload.get("occurredAt"));
    writeString(output, 3, payload.get("actorUserId"));
    writeString(output, 4, payload.get("mediaId"));
    writeString(output, 5, payload.get("bucketName"));
    writeString(output, 6, payload.get("objectKey"));
    writeString(output, 7, payload.get("kind"));
    writeString(output, 8, payload.get("contentType"));
    writeVarIntField(output, 9, ((Number) payload.get("fileSizeBytes")).longValue());
    writeString(output, 10, payload.get("checksumSha256"));
    return output.toByteArray();
  }

  static byte[] mediaUploadCompleted(Map<String, Object> payload) {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    writeString(output, 1, payload.get("eventId"));
    writeString(output, 2, payload.get("occurredAt"));
    writeString(output, 3, payload.get("actorUserId"));
    writeString(output, 4, payload.get("mediaId"));
    writeString(output, 5, payload.get("etag"));
    writeVarIntField(output, 6, Boolean.TRUE.equals(payload.get("verifiedByHead")) ? 1 : 0);
    return output.toByteArray();
  }

  private static void writeString(ByteArrayOutputStream output, int fieldNumber, Object value) {
    byte[] encoded = String.valueOf(value).getBytes(StandardCharsets.UTF_8);
    writeVarInt(output, fieldNumber << 3 | 2);
    writeVarInt(output, encoded.length);
    output.writeBytes(encoded);
  }

  private static void writeVarIntField(ByteArrayOutputStream output, int fieldNumber, long value) {
    writeVarInt(output, fieldNumber << 3);
    writeVarInt(output, value);
  }

  private static void writeVarInt(ByteArrayOutputStream output, long value) {
    long remaining = value;
    while ((remaining & ~0x7fL) != 0) {
      output.write((int) (remaining & 0x7fL) | 0x80);
      remaining >>>= 7;
    }
    output.write((int) remaining);
  }
}
