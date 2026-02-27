import { describe, expect, it } from "vitest";

import {
  decodeConsentAccessCheckedEvent,
  decodeMediaUploadCompletedEvent,
  decodeMediaUploadTicketIssuedEvent,
  encodeConsentAccessCheckedEvent,
  encodeMediaUploadCompletedEvent,
  encodeMediaUploadTicketIssuedEvent
} from "./internal-events.codec";

describe("Internal protobuf event codecs", () => {
  it("round-trips media upload ticket issued event", () => {
    const input = {
      eventId: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-02-27T12:00:00.000Z",
      actorUserId: "22222222-2222-4222-8222-222222222222",
      mediaId: "33333333-3333-4333-8333-333333333333",
      bucketName: "illamhelp-quarantine",
      objectKey: "u/2026-02-27/file.jpg",
      kind: "image",
      contentType: "image/jpeg",
      fileSizeBytes: 2048,
      checksumSha256: "a".repeat(64)
    };

    const encoded = encodeMediaUploadTicketIssuedEvent(input);
    const decoded = decodeMediaUploadTicketIssuedEvent(encoded);
    expect(decoded).toEqual(input);
  });

  it("round-trips media upload completed event", () => {
    const input = {
      eventId: "44444444-4444-4444-8444-444444444444",
      occurredAt: "2026-02-27T12:01:00.000Z",
      actorUserId: "22222222-2222-4222-8222-222222222222",
      mediaId: "33333333-3333-4333-8333-333333333333",
      etag: "0cc175b9c0f1b6a831c399e269772661",
      verifiedByHead: true
    };

    const encoded = encodeMediaUploadCompletedEvent(input);
    const decoded = decodeMediaUploadCompletedEvent(encoded);
    expect(decoded).toEqual(input);
  });

  it("round-trips consent access checked event", () => {
    const input = {
      eventId: "55555555-5555-4555-8555-555555555555",
      occurredAt: "2026-02-27T12:02:00.000Z",
      actorUserId: "66666666-6666-4666-8666-666666666666",
      ownerUserId: "77777777-7777-4777-8777-777777777777",
      field: "phone",
      allowed: false,
      reason: "no_active_grant",
      purpose: "consent_read_path"
    };

    const encoded = encodeConsentAccessCheckedEvent(input);
    const decoded = decodeConsentAccessCheckedEvent(encoded);
    expect(decoded).toEqual(input);
  });
});
