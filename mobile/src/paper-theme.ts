import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';
import type { AppTheme } from './theme';

export function buildPaperTheme(theme: AppTheme): MD3Theme {
  const base = theme.mode === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const c = theme.colors;
  return {
    ...base,
    roundness: theme.radii.md / 3,
    colors: {
      ...base.colors,
      primary: c.brandText, onPrimary: theme.mode === 'dark' ? c.bg : c.onStrong,
      primaryContainer: c.surfaceAlt, onPrimaryContainer: c.ink,
      secondary: c.brandAltText, onSecondary: theme.mode === 'dark' ? c.bg : c.onStrong,
      secondaryContainer: c.surfaceAlt, onSecondaryContainer: c.ink,
      background: c.bg, onBackground: c.ink,
      surface: c.surface, onSurface: c.ink,
      surfaceVariant: c.surfaceAlt, onSurfaceVariant: c.muted,
      outline: c.muted, outlineVariant: c.line,
      error: c.errorText, onError: theme.mode === 'dark' ? c.bg : c.onStrong,
      errorContainer: c.surfaceAlt, onErrorContainer: c.errorText,
      elevation: { level0: 'transparent', level1: c.surface, level2: c.surfaceAlt, level3: c.surfaceAlt, level4: c.surfaceAlt, level5: c.surfaceAlt },
    },
    fonts: configureFonts({ config: { fontFamily: 'System' } }),
  };
}
