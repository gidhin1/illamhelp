import type { JSX } from "react";
import { useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import {
  canEmailLegalContact,
  CURRENT_LEGAL_VERSIONS,
  FAQ_ENTRIES,
  filterFaqEntries,
  HELP_TOPICS,
  helpShortcuts,
  LEGAL_CONTACT,
  legalPages,
  legalSectionId,
  PRIVACY_POLICY_SECTIONS,
  TERMS_SECTIONS,
  type LegalPageKey
} from "@illamhelp/shared-types";

import { AppButton, Banner, InputField, SectionCard } from "../components";
import { useAppTheme, useAppStyles } from "../theme-context";

export type LegalHelpTab = LegalPageKey;

function createLegalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tab: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface
    },
    tabActive: { borderColor: colors.brand, backgroundColor: colors.surfaceAlt },
    tabLabel: { color: colors.ink, fontSize: 14, fontWeight: "600" },
    tabLabelActive: { color: colors.brandText },
    document: { gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
    paragraph: { color: colors.ink, fontSize: 15, lineHeight: 24 },
    question: { minHeight: 44, justifyContent: "center", paddingVertical: 7 }
  });
}

type OpenShortcut = (route: (typeof helpShortcuts)[number]["route"]) => void;

function ContactDetails({ includeEntity = false, onLayout }: {
  includeEntity?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}): JSX.Element {
  const styles = useAppStyles();
  const [error, setError] = useState("");
  const contacts = [
    { label: "Support email", address: LEGAL_CONTACT.supportEmail },
    { label: "Grievance email", address: LEGAL_CONTACT.grievanceEmail }
  ];
  return (
    <View onLayout={onLayout}>
      <SectionCard variant="summary" title="Contact details">
        {contacts.some(({ address }) => !canEmailLegalContact(address)) ? (
          <Text style={styles.cardBodyMuted}>Placeholder contact details are pending confirmation.</Text>
        ) : null}
        {includeEntity ? (
          <View style={styles.stackSmall}>
            <Text style={styles.fieldLabel}>Legal entity</Text>
            <Text style={styles.cardBodyMuted}>{LEGAL_CONTACT.entityName}</Text>
            <Text style={styles.fieldLabel}>Registered office</Text>
            <Text style={styles.cardBodyMuted}>{LEGAL_CONTACT.address}</Text>
          </View>
        ) : null}
        {error ? <Banner tone="error" message={error} /> : null}
        {contacts.map(({ label, address }) => (
          <View key={label} style={styles.stackSmall}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text selectable style={styles.cardBodyMuted}>{address}</Text>
            {canEmailLegalContact(address) ? (
              <AppButton label={label === "Support email" ? "Email support" : "Email the grievance contact"}
                variant="secondary" onPress={() => {
                  setError("");
                  void Linking.openURL(`mailto:${address}`).catch(() => setError("Couldn’t open email. Use the address shown."));
                }} />
            ) : null}
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

export function LegalHelpContent({ initialTab = "help", compact = false, onOpen, onScrollTo }: {
  initialTab?: LegalHelpTab;
  compact?: boolean;
  onOpen?: OpenShortcut;
  onScrollTo: (y: number) => void;
}): JSX.Element {
  const styles = useAppStyles();
  const { colors } = useAppTheme();
  const local = useMemo(() => createLegalStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<LegalHelpTab>(initialTab);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const positions = useRef<Record<string, number>>({});
  const contentY = useRef(0);
  const content = legalPages[activeTab];
  const entries = filterFaqEntries(FAQ_ENTRIES, query);
  const sections = activeTab === "terms" ? TERMS_SECTIONS : activeTab === "privacy" ? PRIVACY_POLICY_SECTIONS : null;

  function jumpTo(key: string): void {
    const y = positions.current[key];
    if (y !== undefined) onScrollTo(Math.max(0, contentY.current + y - 12));
  }

  function remember(key: string, event: LayoutChangeEvent): void {
    positions.current[key] = event.nativeEvent.layout.y;
  }

  return (
    <View style={styles.stackSmall} onLayout={(event) => { contentY.current = event.nativeEvent.layout.y; }}>
      <View style={local.tabs} accessibilityRole="tablist" accessibilityLabel="Help and policies">
        {(Object.keys(legalPages) as LegalHelpTab[]).map((key) => (
          <Pressable
            key={key}
            style={[local.tab, activeTab === key ? local.tabActive : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            testID={`legal-tab-${key}`}
            onPress={() => {
              if (key === activeTab) return;
              setActiveTab(key);
              setExpanded(null);
              setIndexOpen(false);
              onScrollTo(0);
            }}
          >
            <Text style={[local.tabLabel, activeTab === key ? local.tabLabelActive : null]}>{legalPages[key].label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.screenHeader}>
        <Text style={compact ? styles.cardTitle : styles.screenTitle} accessibilityRole="header">{content.title}</Text>
        <Text style={styles.screenSubtitle}>{content.description}</Text>
      </View>

      {activeTab === "help" ? (
        <>
          {onOpen ? (
            <SectionCard title="Get help with a task" variant="action">
              {helpShortcuts.map(({ label, detail, route }) => (
                <View key={route} style={styles.stackSmall}>
                  <AppButton label={label} variant="secondary" onPress={() => onOpen(route)} testID={`help-open-${route}`} />
                  <Text style={styles.cardBodyMuted}>{detail}</Text>
                </View>
              ))}
            </SectionCard>
          ) : null}
          <Text accessibilityRole="header" style={styles.cardTitle}>How IllamHelp works</Text>
          {HELP_TOPICS.map((topic, index) => (
            <View key={topic.title} style={styles.alertRow}>
              <Pressable style={local.question} accessibilityRole="button" accessibilityState={{ expanded: expanded === topic.title }}
                testID={`help-topic-${index}`} onPress={() => setExpanded(expanded === topic.title ? null : topic.title)}>
                <Text style={styles.dataTitle}>{topic.title}</Text>
              </Pressable>
              {expanded === topic.title ? (
                <>
                  <Text style={local.paragraph}>{topic.humanIdentity}</Text>
                  <Text style={local.paragraph}>{topic.privacyState}</Text>
                  <Text style={local.paragraph}>{topic.nextSafeAction}</Text>
                </>
              ) : null}
            </View>
          ))}
          <ContactDetails />
        </>
      ) : null}

      {activeTab === "faq" ? (
        <>
          <InputField label="Search questions" value={query} placeholder="e.g. verification documents" testID="legal-faq-search"
            onChangeText={(value) => { setQuery(value); setExpanded(null); }} returnKeyType="search" />
          {query.trim() ? (
            <>
              <Text style={styles.cardBodyMuted} accessibilityLiveRegion="polite">
                {entries.length ? `${entries.length} matching ${entries.length === 1 ? "question" : "questions"}` : "No matching questions. Try a different search."}
              </Text>
              <AppButton label="Clear search" variant="ghost" onPress={() => { setQuery(""); setExpanded(null); }} testID="legal-faq-clear" />
            </>
          ) : null}
          {entries.map((entry) => (
            <View key={entry.question} style={styles.alertRow}>
              <Pressable style={local.question} accessibilityRole="button" accessibilityState={{ expanded: expanded === entry.question }}
                onPress={() => setExpanded(expanded === entry.question ? null : entry.question)}>
                <Text style={styles.dataTitle}>{entry.question}</Text>
              </Pressable>
              {expanded === entry.question ? <Text style={local.paragraph}>{entry.answer}</Text> : null}
            </View>
          ))}
        </>
      ) : null}

      {sections ? (
        <>
          <Text style={styles.dataMeta}>Version {activeTab === "terms" ? CURRENT_LEGAL_VERSIONS.terms : CURRENT_LEGAL_VERSIONS.privacyPolicy}</Text>
          <Text style={styles.dataMeta}>Effective {CURRENT_LEGAL_VERSIONS.effectiveDate} · Last updated {CURRENT_LEGAL_VERSIONS.lastUpdatedDate}</Text>
          <View onLayout={(event) => remember("index", event)}>
            <AppButton label="On this page" variant="secondary" expanded={indexOpen} onPress={() => setIndexOpen(!indexOpen)} testID="legal-section-index" />
            {indexOpen ? (
              <View style={styles.stackSmall}>
                {sections.map((section) => {
                  const id = legalSectionId(section);
                  return <AppButton key={id} label={section.title} variant="ghost" onPress={() => jumpTo(id)} testID={`legal-jump-${id}`} />;
                })}
                <AppButton label="Contact details" variant="ghost" onPress={() => jumpTo("contact")} testID="legal-jump-contact" />
              </View>
            ) : null}
          </View>
          {sections.map((section) => {
            const id = legalSectionId(section);
            return (
              <View key={id} style={local.document} onLayout={(event) => remember(id, event)}>
                <Text accessibilityRole="header" style={styles.cardTitle} testID={`legal-section-${id}`}>{section.title}</Text>
                {section.body.map((paragraph) => <Text key={paragraph} style={local.paragraph}>{paragraph}</Text>)}
              </View>
            );
          })}
          <ContactDetails includeEntity onLayout={(event) => remember("contact", event)} />
          <AppButton label="Back to section list" variant="secondary" onPress={() => jumpTo("index")} testID="legal-back-to-index" />
        </>
      ) : null}
    </View>
  );
}

export function LegalHelpScreen({ onOpen }: { onOpen: OpenShortcut }): JSX.Element {
  const styles = useAppStyles();
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.screenScroll} testID="legal-help-screen"
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      <LegalHelpContent onOpen={onOpen} onScrollTo={(y) => scroll.current?.scrollTo({ y, animated: false })} />
    </ScrollView>
  );
}
