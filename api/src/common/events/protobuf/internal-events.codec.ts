import {
  DecodeCursor,
  encodeBoolField,
  encodeStringField,
  encodeUint64Field,
  readBool,
  readString,
  readTag,
  readUint64AsNumber,
  skipField
} from "./wire";

export const INTERNAL_EVENT_NAMES = {
  MEDIA_UPLOAD_TICKET_ISSUED: "internal.media.upload_ticket_issued",
  MEDIA_UPLOAD_COMPLETED: "internal.media.upload_completed",
  CONSENT_ACCESS_CHECKED: "internal.consent.access_checked"
} as const;

export const INTERNAL_EVENT_VERSION = "v1";

export interface MediaUploadTicketIssuedEvent {
  eventId: string;
  occurredAt: string;
  actorUserId: string;
  mediaId: string;
  bucketName: string;
  objectKey: string;
  kind: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

export interface MediaUploadCompletedEvent {
  eventId: string;
  occurredAt: string;
  actorUserId: string;
  mediaId: string;
  etag: string;
  verifiedByHead: boolean;
}

export interface ConsentAccessCheckedEvent {
  eventId: string;
  occurredAt: string;
  actorUserId: string;
  ownerUserId: string;
  field: string;
  allowed: boolean;
  reason: string;
  purpose: string;
}

export function encodeMediaUploadTicketIssuedEvent(
  event: MediaUploadTicketIssuedEvent
): Buffer {
  return Buffer.concat([
    encodeStringField(1, event.eventId),
    encodeStringField(2, event.occurredAt),
    encodeStringField(3, event.actorUserId),
    encodeStringField(4, event.mediaId),
    encodeStringField(5, event.bucketName),
    encodeStringField(6, event.objectKey),
    encodeStringField(7, event.kind),
    encodeStringField(8, event.contentType),
    encodeUint64Field(9, event.fileSizeBytes),
    encodeStringField(10, event.checksumSha256)
  ]);
}

export function decodeMediaUploadTicketIssuedEvent(
  payload: Buffer
): MediaUploadTicketIssuedEvent {
  const cursor: DecodeCursor = { offset: 0 };
  const decoded: MediaUploadTicketIssuedEvent = {
    eventId: "",
    occurredAt: "",
    actorUserId: "",
    mediaId: "",
    bucketName: "",
    objectKey: "",
    kind: "",
    contentType: "",
    fileSizeBytes: 0,
    checksumSha256: ""
  };

  while (cursor.offset < payload.length) {
    const { fieldNumber, wireType } = readTag(payload, cursor);
    switch (fieldNumber) {
      case 1:
        decoded.eventId = readString(payload, cursor);
        break;
      case 2:
        decoded.occurredAt = readString(payload, cursor);
        break;
      case 3:
        decoded.actorUserId = readString(payload, cursor);
        break;
      case 4:
        decoded.mediaId = readString(payload, cursor);
        break;
      case 5:
        decoded.bucketName = readString(payload, cursor);
        break;
      case 6:
        decoded.objectKey = readString(payload, cursor);
        break;
      case 7:
        decoded.kind = readString(payload, cursor);
        break;
      case 8:
        decoded.contentType = readString(payload, cursor);
        break;
      case 9:
        decoded.fileSizeBytes = readUint64AsNumber(payload, cursor);
        break;
      case 10:
        decoded.checksumSha256 = readString(payload, cursor);
        break;
      default:
        skipField(wireType, payload, cursor);
    }
  }

  return decoded;
}

export function encodeMediaUploadCompletedEvent(event: MediaUploadCompletedEvent): Buffer {
  return Buffer.concat([
    encodeStringField(1, event.eventId),
    encodeStringField(2, event.occurredAt),
    encodeStringField(3, event.actorUserId),
    encodeStringField(4, event.mediaId),
    encodeStringField(5, event.etag),
    encodeBoolField(6, event.verifiedByHead)
  ]);
}

export function decodeMediaUploadCompletedEvent(payload: Buffer): MediaUploadCompletedEvent {
  const cursor: DecodeCursor = { offset: 0 };
  const decoded: MediaUploadCompletedEvent = {
    eventId: "",
    occurredAt: "",
    actorUserId: "",
    mediaId: "",
    etag: "",
    verifiedByHead: false
  };

  while (cursor.offset < payload.length) {
    const { fieldNumber, wireType } = readTag(payload, cursor);
    switch (fieldNumber) {
      case 1:
        decoded.eventId = readString(payload, cursor);
        break;
      case 2:
        decoded.occurredAt = readString(payload, cursor);
        break;
      case 3:
        decoded.actorUserId = readString(payload, cursor);
        break;
      case 4:
        decoded.mediaId = readString(payload, cursor);
        break;
      case 5:
        decoded.etag = readString(payload, cursor);
        break;
      case 6:
        decoded.verifiedByHead = readBool(payload, cursor);
        break;
      default:
        skipField(wireType, payload, cursor);
    }
  }

  return decoded;
}

export function encodeConsentAccessCheckedEvent(event: ConsentAccessCheckedEvent): Buffer {
  return Buffer.concat([
    encodeStringField(1, event.eventId),
    encodeStringField(2, event.occurredAt),
    encodeStringField(3, event.actorUserId),
    encodeStringField(4, event.ownerUserId),
    encodeStringField(5, event.field),
    encodeBoolField(6, event.allowed),
    encodeStringField(7, event.reason),
    encodeStringField(8, event.purpose)
  ]);
}

export function decodeConsentAccessCheckedEvent(payload: Buffer): ConsentAccessCheckedEvent {
  const cursor: DecodeCursor = { offset: 0 };
  const decoded: ConsentAccessCheckedEvent = {
    eventId: "",
    occurredAt: "",
    actorUserId: "",
    ownerUserId: "",
    field: "",
    allowed: false,
    reason: "",
    purpose: ""
  };

  while (cursor.offset < payload.length) {
    const { fieldNumber, wireType } = readTag(payload, cursor);
    switch (fieldNumber) {
      case 1:
        decoded.eventId = readString(payload, cursor);
        break;
      case 2:
        decoded.occurredAt = readString(payload, cursor);
        break;
      case 3:
        decoded.actorUserId = readString(payload, cursor);
        break;
      case 4:
        decoded.ownerUserId = readString(payload, cursor);
        break;
      case 5:
        decoded.field = readString(payload, cursor);
        break;
      case 6:
        decoded.allowed = readBool(payload, cursor);
        break;
      case 7:
        decoded.reason = readString(payload, cursor);
        break;
      case 8:
        decoded.purpose = readString(payload, cursor);
        break;
      default:
        skipField(wireType, payload, cursor);
    }
  }

  return decoded;
}
