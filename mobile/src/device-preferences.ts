import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const pendingWrites = new Map<string, Promise<void>>();

function preferenceFile(key: string): string {
  if (!FileSystem.documentDirectory) throw new Error("Device storage is unavailable.");
  return `${FileSystem.documentDirectory}${key}.json`;
}

export async function readDevicePreference(key: string): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage.getItem(key);
  const path = preferenceFile(key);
  const file = await FileSystem.getInfoAsync(path);
  return file.exists ? FileSystem.readAsStringAsync(path) : null;
}

export function writeDevicePreference(key: string, value: string): Promise<void> {
  const previous = pendingWrites.get(key);
  const next = (previous?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
    if (Platform.OS === "web") {
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await FileSystem.writeAsStringAsync(preferenceFile(key), value);
  });
  pendingWrites.set(key, next);
  return next.finally(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  });
}
