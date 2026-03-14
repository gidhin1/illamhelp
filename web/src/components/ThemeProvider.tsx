"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { ThemePreference } from "@illamhelp/shared-types";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "illamhelp.theme.preference";

export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") {
      root.removeAttribute("data-theme");
      window.localStorage.setItem(STORAGE_KEY, "system");
      return;
    }
    root.setAttribute("data-theme", preference);
    window.localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  const value = useMemo(() => ({ preference, setPreference }), [preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("ThemeProvider must wrap the app before using theme preference.");
  }
  return context;
}
