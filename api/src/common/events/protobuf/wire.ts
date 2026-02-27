const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

export interface DecodeCursor {
  offset: number;
}

export function encodeVarint(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Varint value must be a non-negative integer");
  }

  const bytes: number[] = [];
  let current = value;
  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 128);
  }
  bytes.push(current);
  return Buffer.from(bytes);
}

export function decodeVarint(buffer: Buffer, cursor: DecodeCursor): number {
  let result = 0;
  let shift = 0;

  while (cursor.offset < buffer.length) {
    const byte = buffer[cursor.offset++];
    result += (byte & 0x7f) * 2 ** shift;

    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(result)) {
        throw new Error("Decoded varint exceeds Number.MAX_SAFE_INTEGER");
      }
      return result;
    }
    shift += 7;
  }

  throw new Error("Unexpected EOF while decoding varint");
}

function encodeTag(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType);
}

export function encodeStringField(fieldNumber: number, value: string): Buffer {
  const payload = Buffer.from(value, "utf8");
  return Buffer.concat([
    encodeTag(fieldNumber, WIRE_TYPE_LENGTH_DELIMITED),
    encodeVarint(payload.length),
    payload
  ]);
}

export function encodeBoolField(fieldNumber: number, value: boolean): Buffer {
  return Buffer.concat([
    encodeTag(fieldNumber, WIRE_TYPE_VARINT),
    encodeVarint(value ? 1 : 0)
  ]);
}

export function encodeUint64Field(fieldNumber: number, value: number): Buffer {
  return Buffer.concat([
    encodeTag(fieldNumber, WIRE_TYPE_VARINT),
    encodeVarint(value)
  ]);
}

export function readTag(buffer: Buffer, cursor: DecodeCursor): {
  fieldNumber: number;
  wireType: number;
} {
  const tag = decodeVarint(buffer, cursor);
  return {
    fieldNumber: tag >> 3,
    wireType: tag & 0x07
  };
}

export function readString(buffer: Buffer, cursor: DecodeCursor): string {
  const length = decodeVarint(buffer, cursor);
  const end = cursor.offset + length;
  if (end > buffer.length) {
    throw new Error("Unexpected EOF while decoding string field");
  }
  const value = buffer.subarray(cursor.offset, end).toString("utf8");
  cursor.offset = end;
  return value;
}

export function readBool(buffer: Buffer, cursor: DecodeCursor): boolean {
  return decodeVarint(buffer, cursor) !== 0;
}

export function readUint64AsNumber(buffer: Buffer, cursor: DecodeCursor): number {
  return decodeVarint(buffer, cursor);
}

export function skipField(
  wireType: number,
  buffer: Buffer,
  cursor: DecodeCursor
): void {
  if (wireType === WIRE_TYPE_VARINT) {
    void decodeVarint(buffer, cursor);
    return;
  }

  if (wireType === WIRE_TYPE_LENGTH_DELIMITED) {
    const length = decodeVarint(buffer, cursor);
    const end = cursor.offset + length;
    if (end > buffer.length) {
      throw new Error("Unexpected EOF while skipping length-delimited field");
    }
    cursor.offset = end;
    return;
  }

  throw new Error(`Unsupported wire type: ${wireType}`);
}
