import type { JSX } from "react";
import { analyticsPreferenceDescription, appearanceChoices } from "@illamhelp/shared-types";
import { ScrollView, Text, View } from "react-native";
import { saveAnalyticsPreference, useAnalyticsPreference } from "../analytics-preference";
import { AppButton, Banner, SectionCard } from "../components";
import type { MobileRouteKey } from "../navigation/registry";
import { useAppStyles, useThemePreference } from "../theme-context";

const shortcuts = [
  { title: "Contact sharing", detail: "Choose who can see your contact details.", route: "privacy", label: "Manage contact sharing" },
  { title: "Profile", detail: "Update your details, services, and work samples.", route: "profile", label: "Edit profile" },
  { title: "Alerts", detail: "Check updates and manage what you’ve read.", route: "alerts", label: "View alerts" },
  { title: "Help and support", detail: "Find answers, policies, and support.", route: "help", label: "Open Help" }
] as const;

export function SettingsScreen({ onOpen }: { onOpen: (route: MobileRouteKey) => void }): JSX.Element {
  const styles = useAppStyles();
  const { preference, preferenceError, setPreference } = useThemePreference();
  const { choice, ready, saving, error } = useAnalyticsPreference();
  const enabled = choice.analytics === "granted";

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} testID="settings-scroll">
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">Account settings</Text>
      </View>
      <SectionCard title="Appearance">
        <Text style={styles.cardBodyMuted}>Choose how IllamHelp looks on this device.</Text>
        {preferenceError ? <Banner tone="error" message={preferenceError} /> : null}
        <View style={styles.roleRow}>
          {appearanceChoices.map(({ value, label }) => (
            <AppButton key={value} label={label} selected={preference === value}
              variant={preference === value ? "primary" : "secondary"} onPress={() => setPreference(value)} testID={`settings-theme-${value}`} />
          ))}
        </View>
      </SectionCard>
      <SectionCard title="Analytics">
        <Text style={styles.cardBodyMuted}>{analyticsPreferenceDescription}</Text>
        <Text style={styles.dataMeta} accessibilityLiveRegion="polite" testID="settings-analytics-status">
          {!ready ? "Loading preference…" : enabled ? "Analytics on" : "Analytics off"}
        </Text>
        {error ? <Banner tone="error" message={error} /> : null}
        <AppButton label={enabled ? "Turn off analytics" : "Turn on analytics"} variant="secondary" disabled={!ready || saving}
          onPress={() => void saveAnalyticsPreference(!enabled)} testID="settings-analytics-toggle" />
      </SectionCard>
      {shortcuts.map(({ title, detail, label, route }) => (
        <View style={styles.alertRow} key={route}>
          <Text style={styles.dataTitle}>{title}</Text>
          <Text style={styles.cardBodyMuted}>{detail}</Text>
          <AppButton label={label} variant="secondary" onPress={() => onOpen(route)} testID={`settings-open-${route}`} />
        </View>
      ))}
    </ScrollView>
  );
}
