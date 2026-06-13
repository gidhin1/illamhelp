import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DashboardResponse, formatDate, getMyDashboard } from "../api";
import { Banner, MotionView, SectionCard } from "../components";
import { asError, shouldForceSignOut } from "../utils";
import { useAppStyles, useAppTheme } from "../theme-context";

type FeedFilter = "all" | "active" | "nearby";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    header: {
      gap: 14,
      marginBottom: 4
    },
    heroPanel: {
      borderRadius: 14,
      padding: 20,
      gap: 14,
      backgroundColor: colors.brand,
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4
    },
    heroPill: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.26)",
      color: colors.onStrong,
      overflow: "hidden",
      fontSize: 12,
      fontWeight: "700"
    },
    headerTitle: {
      color: colors.onStrong,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "700"
    },
    headerBody: {
      color: "rgba(255,255,255,0.86)",
      fontSize: 16,
      lineHeight: 24,
      maxWidth: 320
    },
    signalRail: {
      gap: 8
    },
    signalCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)"
    },
    signalDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.onStrong
    },
    signalText: {
      color: colors.onStrong,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
      flex: 1
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
      flexWrap: "wrap"
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    filterChipActive: {
      backgroundColor: colors.surface,
      borderColor: colors.brand
    },
    filterChipLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18
    },
    filterChipLabelActive: {
      color: colors.brand
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      paddingRight: 10
    },
    statCard: {
      width: 146,
      borderRadius: 12,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    statLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16
    },
    statValue: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "700",
      lineHeight: 31
    },
    statCardAccent: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.brand
    },
    feedSection: {
      gap: 12
    },
    feedHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    feedTitle: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "700",
      lineHeight: 25
    },
    jobCard: {
      width: 292,
      borderRadius: 12,
      padding: 18,
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    jobCardActive: {
      borderColor: colors.brand,
      backgroundColor: colors.surfaceAlt
    },
    jobMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12
    },
    jobCategory: {
      color: colors.brand,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden"
    },
    jobStatus: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16
    },
    jobTitle: {
      color: colors.ink,
      fontSize: 21,
      fontWeight: "700",
      lineHeight: 26
    },
    jobBody: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22
    },
    jobFooter: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap"
    },
    jobFooterText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18
    },
    privacyNote: {
      color: colors.brandText,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18
    }
  });
}

export function HomeScreen({
  accessToken,
  onSessionInvalid
}: {
  accessToken: string;
  onSessionInvalid: () => void;
}): JSX.Element {
  const styles = useAppStyles();
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getMyDashboard(accessToken);
      setDashboard(payload);
    } catch (requestError) {
      const message = asError(requestError, "Failed to load home feed");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredJobs = useMemo(() => {
    const jobs = dashboard?.recentJobs ?? [];
    if (filter === "active") {
      return jobs.filter((job) => job.status !== "posted" && job.status !== "closed");
    }
    if (filter === "nearby") {
      const city = dashboard?.profile.city?.toLowerCase();
      if (!city) {
        return jobs;
      }
      return jobs.filter((job) => job.locationText.toLowerCase().includes(city));
    }
    return jobs;
  }, [dashboard, filter]);

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="home-scroll"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <MotionView style={[localStyles.header, localStyles.heroPanel]} variant="rise">
        <Text style={localStyles.heroPill}>Today in IllamHelp</Text>
        <Text style={localStyles.headerTitle}>Your next steps</Text>
        <Text style={localStyles.headerBody}>
          Review jobs, contact sharing, and profile updates that need your attention.
        </Text>
        <View style={localStyles.signalRail} accessibilityLabel="Home safety highlights">
          {[
            "Human identity first: review the person or job owner",
            "Privacy state visible: contact details stay controlled",
            "Next safe action: post, apply, or check alerts"
          ].map((label) => (
            <View key={label} style={localStyles.signalCard}>
              <View style={localStyles.signalDot} />
              <Text style={localStyles.signalText}>{label}</Text>
            </View>
          ))}
        </View>
      </MotionView>

      {error ? <Banner tone="error" message={error} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.statsRow}>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Jobs</Text>
          <Text style={localStyles.statValue}>{dashboard?.metrics.totalJobs ?? 0}</Text>
        </View>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Connections</Text>
          <Text style={localStyles.statValue}>{dashboard?.metrics.totalConnections ?? 0}</Text>
        </View>
        <View style={[localStyles.statCard, localStyles.statCardAccent]}>
          <Text style={localStyles.statLabel}>Pending</Text>
          <Text style={localStyles.statValue}>{dashboard?.metrics.pendingConnections ?? 0}</Text>
        </View>
      </ScrollView>

      <View style={localStyles.filterRow}>
        {([
          ["all", "All"],
          ["active", "Active"],
          ["nearby", "Nearby"]
        ] as const).map(([value, label]) => {
          const active = filter === value;
          return (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[localStyles.filterChip, active ? localStyles.filterChipActive : null]}
              testID={`home-filter-${value}`}
              accessibilityRole="button"
              accessibilityLabel={`${label} jobs`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[localStyles.filterChipLabel, active ? localStyles.filterChipLabelActive : null]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={localStyles.feedSection}>
        <View style={localStyles.feedHeader}>
          <Text style={localStyles.feedTitle}>Recent jobs</Text>
          <Text style={styles.cardBodyMuted}>{filteredJobs.length} updates</Text>
        </View>

        {loading ? <Text style={styles.cardBodyMuted}>Refreshing your feed...</Text> : null}
        {!loading && filteredJobs.length === 0 ? (
          <SectionCard
            title="Nothing to show yet"
            subtitle="As new jobs and trust activity come in, your personalized feed will appear here."
            motion="rise"
          >
            <Text style={styles.cardBodyMuted}>Try switching filters or come back after your next connection or job post.</Text>
          </SectionCard>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.statsRow}>
        {filteredJobs.map((job, index) => (
          <MotionView
            key={job.id}
            style={[
              localStyles.jobCard,
              job.status !== "posted" && job.status !== "closed" ? localStyles.jobCardActive : null
            ]}
            variant="rise"
            delay={Math.min(index * 42, 210)}
          >
            <View style={localStyles.jobMetaRow}>
              <Text style={localStyles.jobCategory}>{job.category}</Text>
              <Text style={localStyles.jobStatus}>{job.status.replaceAll("_", " ")}</Text>
            </View>
            <Text style={localStyles.jobTitle}>{job.title}</Text>
            <Text style={localStyles.jobBody}>{job.locationText}</Text>
            <View style={localStyles.jobFooter}>
              <Text style={localStyles.jobFooterText}>Posted {formatDate(job.createdAt)}</Text>
              <Text style={localStyles.privacyNote}>Check profile before sharing contact details</Text>
            </View>
          </MotionView>
        ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}
