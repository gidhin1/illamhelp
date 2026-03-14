import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { buildTheme, ThemePreference, type AppTheme } from "./theme";
import { createAppStyles } from "./styles";

interface ThemeContextValue {
  theme: AppTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("system");
  const theme = useMemo(
    () => buildTheme(preference, systemScheme === "dark" ? "dark" : "light"),
    [preference, systemScheme]
  );

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [preference, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("AppThemeProvider is required before using themed components.");
  }
  return context;
}

export function useAppTheme(): AppTheme {
  return useThemeContext().theme;
}

export function useThemePreference(): {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} {
  const { preference, setPreference } = useThemeContext();
  return { preference, setPreference };
}

export function useAppStyles() {
  const { theme } = useThemeContext();
  return useMemo(() => createAppStyles(theme), [theme]);
}
