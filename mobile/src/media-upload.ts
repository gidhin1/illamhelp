import * as ImagePicker from "expo-image-picker";

import {
  completeMediaUpload,
  createMediaUploadTicket,
  type MediaAssetRecord,
  type MediaContext
} from "./api";
import { randomHex } from "./utils";

export type PickedImageAsset = ImagePicker.ImagePickerAsset;

export async function pickSingleImage(): Promise<PickedImageAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Media library permission is required to choose a profile photo.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
    selectionLimit: 1
  });

  if (result.canceled) {
    return null;
  }

  return result.assets[0] ?? null;
}

export async function uploadPickedImage(
  asset: PickedImageAsset,
  accessToken: string,
  context: MediaContext
): Promise<MediaAssetRecord> {
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const contentType = asset.mimeType ?? blob.type ?? "image/jpeg";

  const ticket = await createMediaUploadTicket(
    {
      kind: "image",
      context,
      contentType,
      fileSizeBytes: asset.fileSize ?? blob.size ?? 0,
      checksumSha256: randomHex(64),
      originalFileName: asset.fileName ?? `upload-${Date.now()}.jpg`
    },
    accessToken
  );

  const uploadResponse = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.requiredHeaders,
    body: blob
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed with status ${uploadResponse.status}`);
  }

  const etag = uploadResponse.headers.get("etag")?.replace(/"/g, "");
  return completeMediaUpload(ticket.mediaId, { etag: etag || undefined }, accessToken);
}

