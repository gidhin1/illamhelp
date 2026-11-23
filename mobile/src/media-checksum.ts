import { toByteArray } from "base64-js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { EncodingType, getInfoAsync, readAsStringAsync } from "expo-file-system";
import { Platform } from "react-native";

export async function mediaChecksum(uri: string): Promise<string> {
  const hash = sha256.create();
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Could not read this file. Choose it again and retry.");
    }
    return bytesToHex(hash.update(new Uint8Array(await response.arrayBuffer())).digest());
  }

  const file = await getInfoAsync(uri);
  if (!file.exists || file.isDirectory || file.size <= 0) {
    throw new Error("Could not read this file. Choose it again and retry.");
  }
  for (let position = 0; position < file.size;) {
    const length = Math.min(file.size - position, 512 * 1024);
    const encoded = await readAsStringAsync(uri, { encoding: EncodingType.Base64, position, length });
    const chunk = toByteArray(encoded);
    if (chunk.length !== length) {
      throw new Error("This file changed while it was being read. Choose it again and retry.");
    }
    hash.update(chunk);
    position += length;
  }
  return bytesToHex(hash.digest());
}
