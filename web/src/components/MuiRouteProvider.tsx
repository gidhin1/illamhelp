"use client";

import { BrandProvider, useBrandColorScheme } from "@illamhelp/ui-web/theme";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { useEffect, type ReactNode } from "react";

import { useThemePreference } from "./ThemeProvider";

function SyncColorScheme() {
  const { preference } = useThemePreference();
  const { mode, setMode } = useBrandColorScheme();
  useEffect(() => {
    if (mode !== preference) setMode(preference);
  }, [mode, preference, setMode]);
  return null;
}

export default function MuiRouteProvider({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <BrandProvider>
        <SyncColorScheme />
        {children}
      </BrandProvider>
    </AppRouterCacheProvider>
  );
}
