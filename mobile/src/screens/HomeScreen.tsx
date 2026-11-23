import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { DashboardResponse, formatDate, getMyDashboard } from "../api";
import { AppButton, Banner, CardSurface, SectionCard, StatusLabel } from "../components";
import { asError, shouldForceSignOut } from "../utils";
import { useAppStyles, useAppTheme } from "../theme-context";

type FeedFilter = "all" | "active" | "nearby";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    filter: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 12 },
    selected: { backgroundColor: colors.surfaceAlt },
    filterLabel: { color: colors.ink, fontWeight: "600" },
    selectedLabel: { color: colors.brandText },
    heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }
  });
}

export function HomeScreen({
  accessToken,
  onSessionInvalid,
  onNavigate
}: {
  accessToken: string;
  onSessionInvalid: () => void;
  onNavigate: (route: "jobs-discover" | "jobs-posted" | "people" | "privacy") => void;
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
      const message = asError(requestError, "Couldn’t load your jobs and updates. Try again.");
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
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">Your jobs and updates</Text>
        <Text style={styles.screenSubtitle}>See recent jobs, connections, and contact requests.</Text>
        <AppButton label="Post a job" testID="home-post-job" onPress={() => onNavigate("jobs-posted")} />
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <View style={localStyles.heading}>
        <Text style={styles.cardTitle} accessibilityRole="header">Recent jobs</Text>
        <Text style={styles.cardBodyMuted}>{filteredJobs.length} {filteredJobs.length === 1 ? "update" : "updates"}</Text>
      </View>
      <View style={localStyles.filters}>
        {([["all", "All"], ["active", "Active"], ["nearby", "Nearby"]] as const).map(([value, label]) => {
          const active = filter === value;
          return (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[localStyles.filter, active && localStyles.selected]}
              testID={`home-filter-${value}`}
              accessibilityRole="button"
              accessibilityLabel={`${label} jobs`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[localStyles.filterLabel, active && localStyles.selectedLabel]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? <Text style={styles.cardBodyMuted}>Refreshing your feed...</Text> : null}
      {!loading && !filteredJobs.length ? (
        <SectionCard title="No updates yet" subtitle="Change the filter or check back after you post a job." >
          <AppButton label="Browse jobs" variant="ghost" onPress={() => onNavigate("jobs-discover")} />
        </SectionCard>
      ) : null}
      {filteredJobs.map((job) => (
        <CardSurface key={job.id} variant="record">
          <View style={localStyles.heading}>
            <Text style={styles.cardTitle} accessibilityRole="header">{job.title}</Text>
            <StatusLabel label={job.status.replaceAll("_", " ")} />
          </View>
          <Text style={styles.dataMeta}>{job.category} · {job.locationText}</Text>
          <Text style={styles.dataMeta}>Posted {formatDate(job.createdAt)}</Text>
          <AppButton label="Open jobs" variant="ghost" onPress={() => onNavigate("jobs-discover")} testID={`home-open-job-${job.id}`} />
        </CardSurface>
      ))}

      <SectionCard title="Account activity" variant="summary">
        {([
          ["Jobs", dashboard?.metrics.totalJobs ?? 0],
          ["Connections", dashboard?.metrics.totalConnections ?? 0],
          ["Pending connections", dashboard?.metrics.pendingConnections ?? 0]
        ] as const).map(([label, count]) => (
          <View key={label} style={styles.summaryRow}>
            <Text style={styles.cardBodyMuted}>{label}</Text>
            <Text style={styles.dataTitle}>{count}</Text>
          </View>
        ))}
        <AppButton label="Review connections" variant="ghost" onPress={() => onNavigate("people")} />
      </SectionCard>
      <SectionCard title="Contact sharing" subtitle="Choose who can see your contact details.">
        <AppButton label="Manage contact sharing" variant="ghost" onPress={() => onNavigate("privacy")} />
      </SectionCard>
    </ScrollView>
  );
}
