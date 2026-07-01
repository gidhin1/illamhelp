import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  CURRENT_LEGAL_VERSIONS,
  FAQ_ENTRIES,
  HELP_TOPICS,
  LEGAL_CONTACT,
  PRIVACY_POLICY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection
} from "@illamhelp/shared-types";

import { SectionCard } from "../components";
import { useAppTheme } from "../theme-context";
import { styles } from "../styles";

export type LegalHelpTab = "help" | "faq" | "privacy" | "terms";

const tabLabels: Array<{ key: LegalHelpTab; label: string }> = [
  { key: "help", label: "Help" },
  { key: "faq", label: "FAQ" },
  { key: "privacy", label: "Privacy" },
  { key: "terms", label: "Terms" }
];

function createLegalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    tabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    tab: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt
    },
    tabActive: {
      borderColor: colors.brand,
      backgroundColor: colors.surface
    },
    tabLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800"
    },
    tabLabelActive: {
      color: colors.brandText
    },
    pressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }]
    },
    meta: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20
    },
    paragraph: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 22
    },
    title: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "800",
      lineHeight: 23
    }
  });
}

function LegalSections({
  sections,
  version
}: {
  sections: LegalSection[];
  version: string;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLegalStyles(theme.colors), [theme.colors]);

  return (
    <>
      <SectionCard title="Document details" motion="rise">
        <Text style={localStyles.meta}>Version {version}</Text>
        <Text style={localStyles.meta}>Effective {CURRENT_LEGAL_VERSIONS.effectiveDate}. Last updated {CURRENT_LEGAL_VERSIONS.lastUpdatedDate}.</Text>
        <Text style={localStyles.meta}>Entity: {LEGAL_CONTACT.entityName}</Text>
        <Text style={localStyles.meta}>Support: {LEGAL_CONTACT.supportEmail}</Text>
        <Text style={localStyles.meta}>Grievance: {LEGAL_CONTACT.grievanceEmail}</Text>
      </SectionCard>
      {sections.map((section) => (
        <SectionCard key={section.title} title={section.title} motion="rise">
          {section.body.map((paragraph) => (
            <Text key={paragraph} style={localStyles.paragraph}>{paragraph}</Text>
          ))}
        </SectionCard>
      ))}
    </>
  );
}

export function LegalHelpContent({
  initialTab = "help",
  compact = false
}: {
  initialTab?: LegalHelpTab;
  compact?: boolean;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLegalStyles(theme.colors), [theme.colors]);
  const [activeTab, setActiveTab] = useState<LegalHelpTab>(initialTab);

  return (
    <View style={{ gap: 16 }}>
      <View style={localStyles.tabs} accessibilityRole="tablist">
        {tabLabels.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [
                localStyles.tab,
                active ? localStyles.tabActive : null,
                pressed ? localStyles.pressed : null
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              testID={`legal-tab-${tab.key}`}
            >
              <Text style={[localStyles.tabLabel, active ? localStyles.tabLabelActive : null]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "help" ? (
        <>
          {HELP_TOPICS.map((topic) => (
            <SectionCard key={topic.title} title={topic.title} motion={compact ? "none" : "rise"}>
              <Text style={localStyles.paragraph}>Human identity: {topic.humanIdentity}</Text>
              <Text style={localStyles.paragraph}>Privacy state: {topic.privacyState}</Text>
              <Text style={localStyles.paragraph}>Next safe action: {topic.nextSafeAction}</Text>
            </SectionCard>
          ))}
        </>
      ) : null}

      {activeTab === "faq" ? (
        <>
          {FAQ_ENTRIES.map((entry) => (
            <SectionCard key={entry.question} title={entry.question} motion={compact ? "none" : "rise"}>
              <Text style={localStyles.paragraph}>{entry.answer}</Text>
            </SectionCard>
          ))}
        </>
      ) : null}

      {activeTab === "privacy" ? (
        <LegalSections sections={PRIVACY_POLICY_SECTIONS} version={CURRENT_LEGAL_VERSIONS.privacyPolicy} />
      ) : null}

      {activeTab === "terms" ? (
        <LegalSections sections={TERMS_SECTIONS} version={CURRENT_LEGAL_VERSIONS.terms} />
      ) : null}
    </View>
  );
}

export function LegalHelpScreen(): JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.screenScroll} testID="legal-help-screen">
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Help</Text>
        <Text style={styles.screenTitle}>Help, FAQ, and legal</Text>
        <Text style={styles.screenSubtitle}>
          Review safe product actions, common questions, Privacy Policy, and Terms in one place.
        </Text>
      </View>
      <LegalHelpContent />
    </ScrollView>
  );
}
