import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DashboardResponse, formatDate, getMyDashboard } from "../api";
import { Banner, SectionCard } from "../components";
import { asError, shouldForceSignOut } from "../utils";
import { useAppStyles, useAppTheme } from "../theme-context";

type FeedFilter = "all" | "active" | "nearby";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    hero: {
      gap: 14,
      marginBottom: 4
    },
    heroEyebrow: {
      color: colors.brand,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase"
    },
    heroTitle: {
      color: colors.ink,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: "800"
    },
    heroBody: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      maxWidth: 320
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
      fontWeight: "700"
    },
    filterChipLabelActive: {
      color: colors.brand
    },
    statsRow: {
      flexDirection: "row",
      gap: 10
    },
    statCard: {
      flex: 1,
      borderRadius: 22,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6
    },
    statLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase"
    },
    statValue: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: "800"
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
      fontWeight: "800"
    },
    jobCard: {
      borderRadius: 26,
      padding: 18,
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
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
      fontWeight: "700",
      textTransform: "uppercase"
    },
    jobTitle: {
      color: colors.ink,
      fontSize: 21,
      fontWeight: "800"
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
      fontWeight: "600"
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
      <View style={localStyles.hero}>
        <Text style={localStyles.heroEyebrow}>For you</Text>
        <Text style={localStyles.heroTitle}>Trusted help, work, and people in one social-style flow.</Text>
        <Text style={localStyles.heroBody}>
          Keep an eye on work opportunities, trust signals, and the network around your home services activity.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={localStyles.statsRow}>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Jobs</Text>
          <Text style={localStyles.statValue}>{dashboard?.metrics.totalJobs ?? 0}</Text>
        </View>
        <View style={localStyles.statCard}>
          <Text style={localStyles.statLabel}>Connections</Text>
          <Text style={localStyles.statValue}>{dashboard?.metrics.totalConnections ?? 0}</Text>
        </View>
      </View>

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
          <Text style={localStyles.feedTitle}>Smart feed</Text>
          <Text style={styles.cardBodyMuted}>{filteredJobs.length} updates</Text>
        </View>

        {loading ? <Text style={styles.cardBodyMuted}>Refreshing your feed...</Text> : null}
        {!loading && filteredJobs.length === 0 ? (
          <SectionCard
            title="Nothing to show yet"
            subtitle="As new jobs and trust activity come in, your personalized feed will appear here."
          >
            <Text style={styles.cardBodyMuted}>Try switching filters or come back after your next connection or job post.</Text>
          </SectionCard>
        ) : null}

        {filteredJobs.map((job) => (
          <View key={job.id} style={localStyles.jobCard}>
            <View style={localStyles.jobMetaRow}>
              <Text style={localStyles.jobCategory}>{job.category}</Text>
              <Text style={localStyles.jobStatus}>{job.status.replaceAll("_", " ")}</Text>
            </View>
            <Text style={localStyles.jobTitle}>{job.title}</Text>
            <Text style={localStyles.jobBody}>{job.locationText}</Text>
            <View style={localStyles.jobFooter}>
              <Text style={localStyles.jobFooterText}>Posted {formatDate(job.createdAt)}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
