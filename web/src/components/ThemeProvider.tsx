"use client";

import type { ThemePreference } from "@illamhelp/shared-types";
import { useEffect, useSyncExternalStore } from "react";

const storageKey = "illamhelp.theme.preference";
const preferenceEvent = "illamhelp:theme-preference";
let fallbackPreference: ThemePreference = "system";

function getPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    return fallbackPreference;
  }
  return "system";
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(preferenceEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(preferenceEvent, listener);
  };
}

function setPreference(preference: ThemePreference): void {
  fallbackPreference = preference;
  applyPreference(preference);
  try {
    window.localStorage.setItem(storageKey, preference);
  } catch {
    // The current document can still switch themes.
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

function applyPreference(preference: ThemePreference): void {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function applyStoredTheme(): void {
  applyPreference(getPreference());
}

export function useThemePreference() {
  const preference = useSyncExternalStore(subscribe, getPreference, (): ThemePreference => "system");
  return { preference, setPreference };
}

export function ThemeInit() {
  const initialize = `(() => {
    let preference;
    try { preference = localStorage.getItem(${JSON.stringify(storageKey)}); } catch {}
    const dark = preference === "dark" ||
      (preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  })();`;
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: initialize }} />;
}

export function ThemeSync() {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    applyStoredTheme();
    system.addEventListener("change", applyStoredTheme);
    window.addEventListener("storage", applyStoredTheme);
    return () => {
      system.removeEventListener("change", applyStoredTheme);
      window.removeEventListener("storage", applyStoredTheme);
    };
  }, []);
  return null;
}
