"use client";

const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SAFE_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type SafeObjectUrl = string & { readonly __safeObjectUrl: unique symbol };

function isSafeBlobUrl(value: string): value is SafeObjectUrl {
  try {
    return new URL(value).protocol === "blob:";
  } catch {
    return false;
  }
}

export function createSafeMediaObjectUrl(file: File, options: { videos?: boolean } = {}): SafeObjectUrl | null {
  const allowedTypes = options.videos ? new Set([...SAFE_IMAGE_TYPES, ...SAFE_VIDEO_TYPES]) : SAFE_IMAGE_TYPES;
  if (!allowedTypes.has(file.type)) return null;

  const objectUrl = URL.createObjectURL(file);
  if (isSafeBlobUrl(objectUrl)) return objectUrl;

  URL.revokeObjectURL(objectUrl);
  return null;
}

export function revokeSafeObjectUrl(objectUrl: SafeObjectUrl): void {
  URL.revokeObjectURL(objectUrl);
}
