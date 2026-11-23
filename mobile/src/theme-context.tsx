import type { JSX } from "react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PaperProvider } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { buildPaperTheme } from "./paper-theme";
import { useColorScheme } from "react-native";

import { buildTheme, ThemePreference, type AppTheme } from "./theme";
import { createAppStyles } from "./styles";
import { readDevicePreference, writeDevicePreference } from "./device-preferences";

const preferenceKey = "illamhelp.theme.preference";

interface ThemeContextValue {
  theme: AppTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  preferenceError: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setCurrentPreference] = useState<ThemePreference>("system");
  const [preferenceError, setPreferenceError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    let cancelled = false;
    void readDevicePreference(preferenceKey).then((stored) => {
      if (cancelled || revision.current) return;
      if (stored === "light" || stored === "dark" || stored === "system") setCurrentPreference(stored);
    }).catch(() => {
      if (!cancelled && !revision.current) setPreferenceError("Couldn’t read your saved appearance. Choose it again below.");
    });
    return () => { cancelled = true; };
  }, []);

  const setPreference = useCallback((value: ThemePreference): void => {
    const request = ++revision.current;
    setCurrentPreference(value);
    setPreferenceError("");
    void writeDevicePreference(preferenceKey, value).catch(() => {
      if (revision.current === request) setPreferenceError("Couldn’t save your appearance. Select it again to retry.");
    });
  }, []);
  const theme = useMemo(
    () => buildTheme(preference, systemScheme === "dark" ? "dark" : "light"),
    [preference, systemScheme]
  );

  const paperTheme = useMemo(() => buildPaperTheme(theme), [theme]);

  const value = useMemo(
    () => ({ theme, preference, preferenceError, setPreference }),
    [preference, preferenceError, setPreference, theme]
  );

  return <ThemeContext.Provider value={value}><PaperProvider theme={paperTheme} settings={{ icon: (props) => <MaterialCommunityIcons {...props} name={props.name as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} /> }}>{children}</PaperProvider></ThemeContext.Provider>;
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
  preferenceError: string;
} {
  const { preference, preferenceError, setPreference } = useThemeContext();
  return { preference, preferenceError, setPreference };
}

export function useAppStyles() {
  const { theme } = useThemeContext();
  return useMemo(() => createAppStyles(theme), [theme]);
}
