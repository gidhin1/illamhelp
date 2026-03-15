"use client";

import {
  completeMediaUpload,
  createMediaUploadTicket,
  type MediaAssetRecord,
  type MediaContext
} from "@/lib/api";

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Browser does not support file checksums.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function uploadMemberMedia(
  file: File,
  accessToken: string,
  context: MediaContext
): Promise<MediaAssetRecord> {
  const contentType = file.type.trim().toLowerCase();
  const kind = contentType.startsWith("image/")
    ? "image"
    : contentType.startsWith("video/")
      ? "video"
      : null;

  if (!kind) {
    throw new Error("Only image or video files are supported.");
  }

  const checksumSha256 = await sha256Hex(file);
  const ticket = await createMediaUploadTicket(
    {
      kind,
      context,
      contentType,
      fileSizeBytes: file.size,
      checksumSha256,
      originalFileName: file.name
    },
    accessToken
  );

  const uploadResponse = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.requiredHeaders,
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed with status ${uploadResponse.status}`);
  }

  const etag = uploadResponse.headers.get("etag")?.replaceAll('"', "") || undefined;
  return completeMediaUpload(ticket.mediaId, { etag }, accessToken);
}

