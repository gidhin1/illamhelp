import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  hasStoredAnalyticsConsent,
  setAnalyticsConsent
} from "./analytics";
import { useAppTheme } from "./theme-context";

export function AnalyticsConsentBanner(): JSX.Element | null {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasStoredAnalyticsConsent());
  }, []);

  if (!visible) {
    return null;
  }

  const styles = StyleSheet.create({
    banner: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 14,
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
    button: {
      minHeight: 42,
      borderRadius: 999,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand
    },
    secondary: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line
    },
    buttonText: {
      color: colors.onStrong,
      fontSize: 13,
      fontWeight: "800"
    },
    secondaryText: {
      color: colors.ink
    }
  });

  const choose = (analytics: "granted" | "denied"): void => {
    setAnalyticsConsent({ analytics, ads: "denied" });
    setVisible(false);
  };

  return (
    <View style={styles.banner} accessibilityLabel="Analytics privacy choice">
      <Text style={styles.title}>Help improve IllamHelp?</Text>
      <Text style={styles.body}>
        Analytics are off until you say yes. We never send names, phone numbers, media links, addresses,
        or verification document details.
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => choose("granted")} accessibilityRole="button">
          <Text style={styles.buttonText}>Accept analytics</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={() => choose("denied")}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
        </Pressable>
      </View>
    </View>
  );
}
