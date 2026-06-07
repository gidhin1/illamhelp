import tokens from "../../packages/ui-tokens/tokens.json";

export type ThemePreference = "system" | "dark" | "light";
export type ThemeMode = "dark" | "light";

export interface AppTheme {
  mode: ThemeMode;
  preference: ThemePreference;
  colors: {
    bg: string;
    bgAlt: string;
    surface: string;
    surfaceAlt: string;
    surfaceHover: string;
    ink: string;
    muted: string;
    brand: string;
    brandAlt: string;
    brandText: string;
    brandAltText: string;
    onStrong: string;
    accent: string;
    line: string;
    shadow: string;
    success: string;
    successText: string;
    error: string;
    errorText: string;
    warning: string;
    warningText: string;
  };
  radii: typeof tokens.radii;
  spacing: typeof tokens.spacing;
  typography: typeof tokens.typography;
  motion: typeof tokens.motion;
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemMode: ThemeMode | null | undefined
): ThemeMode {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemMode === "dark" ? "dark" : "light";
}

export function buildTheme(preference: ThemePreference, systemMode?: ThemeMode | null): AppTheme {
  const mode = resolveThemeMode(preference, systemMode);
  const palette = tokens.colors[mode];
  return {
    mode,
    preference,
    colors: {
      bg: palette.bg,
      bgAlt: palette.bgAlt,
      surface: palette.surface,
      surfaceAlt: palette.surfaceAlt,
      surfaceHover: palette.surfaceHover,
      ink: palette.ink,
      muted: palette.muted,
      brand: palette.brand,
      brandAlt: palette.brandAlt,
      brandText: palette.brandText,
      brandAltText: palette.brandAltText,
      onStrong: palette.onStrong,
      accent: palette.accent,
      line: palette.line,
      shadow: palette.shadow,
      success: palette.success,
      successText: palette.successText,
      error: palette.error,
      errorText: palette.errorText,
      warning: palette.warning,
      warningText: palette.warningText
    },
    radii: tokens.radii,
    spacing: tokens.spacing,
    typography: tokens.typography,
    motion: tokens.motion
  };
}

export const theme = buildTheme("system", "light");
