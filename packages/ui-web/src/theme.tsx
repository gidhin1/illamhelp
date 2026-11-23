'use client';

import { type ReactNode } from 'react';
import { createTheme, ThemeProvider, useColorScheme } from '@mui/material/styles';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import tokens from '@illamhelp/ui-tokens/tokens.json';

export type ThemePreference = 'system' | 'light' | 'dark';

function palette(mode: 'light' | 'dark') {
  const c = tokens.colors[mode];
  return {
    mode,
    primary: { main: c.brandText, contrastText: mode === 'dark' ? c.bg : c.onStrong },
    secondary: { main: c.brandAltText, contrastText: mode === 'dark' ? c.bg : c.onStrong },
    background: { default: c.bg, paper: c.surface },
    text: { primary: c.ink, secondary: c.muted },
    divider: c.line,
    error: { main: c.errorText },
    success: { main: c.successText },
    warning: { main: c.warningText },
    info: { main: c.brandText },
    action: { hover: c.surfaceHover, selected: c.surfaceAlt },
  };
}

export const illamhelpTheme = createTheme({
  cssVariables: { colorSchemeSelector: '[data-theme="%s"]' },
  colorSchemes: { light: { palette: palette('light') }, dark: { palette: palette('dark') } },
  typography: {
    fontFamily: 'var(--font-body), Inter, system-ui, sans-serif',
    fontSize: tokens.typography.sm,
    h1: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 'var(--font-3xl)', fontWeight: 700 },
    h2: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 'var(--font-2xl)', fontWeight: 700 },
    h3: { fontSize: 'var(--font-xl)', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: tokens.radii.md },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { '&.MuiButton-contained.MuiButton-colorPrimary:not(.Mui-disabled)': { backgroundColor: 'var(--brand)', color: 'var(--on-strong)', '&:hover': { backgroundColor: 'var(--brand-2)' } }, borderRadius: tokens.radii.pill, minHeight: 44, maxWidth: '100%', paddingInline: tokens.spacing.xl, textAlign: 'center', whiteSpace: 'normal', overflowWrap: 'anywhere', '&:focus-visible': { outline: '3px solid var(--brand-text)', outlineOffset: 2 } } },
    },
    MuiOutlinedInput: { styleOverrides: { root: { minHeight: 44, background: 'var(--surface)', fontSize: 'var(--font-md)' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: tokens.radii.lg } } },
    MuiTableCell: { styleOverrides: { root: { fontSize: 'var(--font-sm)' } } },
  },
});

export { useColorScheme as useBrandColorScheme };
export function ThemeInit({ persistent = true }: { persistent?: boolean }) {
  return <InitColorSchemeScript attribute="data-theme" modeStorageKey={persistent ? "illamhelp.theme.preference" : "illamhelp.admin.system"} defaultMode="system" />;
}
export function BrandProvider({ children, persistent = false }: { children: ReactNode; persistent?: boolean }) {
  return <ThemeProvider theme={illamhelpTheme} defaultMode="system" modeStorageKey="illamhelp.theme.preference" storageManager={persistent ? undefined : null} disableTransitionOnChange>{children}</ThemeProvider>;
}
