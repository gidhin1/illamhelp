import type { JSX } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "./components";
import { StyleSheet, Text, View } from "react-native";

import { saveAnalyticsPreference, useAnalyticsPreference } from "./analytics-preference";
import { useAppTheme } from "./theme-context";

export function AnalyticsConsentBanner(): JSX.Element | null {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { choice, ready, saving, error } = useAnalyticsPreference();

  if (!ready || choice.updatedAt) return null;

  const styles = StyleSheet.create({
    banner: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 14 + insets.bottom,
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6
    },
    title: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "800"
    },
    body: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },

  });

  return (
    <View style={styles.banner} accessibilityLabel="Analytics privacy choice">
      <Text style={styles.title}>Share app usage data?</Text>
      <Text style={styles.body}>
        Analytics are off by default. If you allow them, we measure app use without sending names, phone numbers, addresses, media links, or verification document details.
      </Text>
      {error ? <Text style={styles.body} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.actions}>
        <AppButton label="Allow analytics" disabled={saving} onPress={() => void saveAnalyticsPreference(true)} />
        <AppButton label="Decline analytics" variant="secondary" disabled={saving} onPress={() => void saveAnalyticsPreference(false)} />
      </View>
    </View>
  );
}
