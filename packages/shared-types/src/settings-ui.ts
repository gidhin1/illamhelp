import type { ThemePreference } from "./index";

export const appearanceChoices = [
  { value: "system", label: "Use device setting" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

export const analyticsPreferenceDescription = "Allow optional app usage measurement on this device. Ad storage stays off.";
