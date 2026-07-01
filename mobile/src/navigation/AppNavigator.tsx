import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { ThemePreference } from "@illamhelp/shared-types";

import { AuthenticatedUser } from "../api";
import { useAppStyles } from "../theme-context";
import { MobileShell } from "./MobileShell";
import type { MobileRouteKey } from "./registry";
import { HomeScreen } from "../screens/HomeScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { JobsScreen } from "../screens/JobsScreen";
import { ConnectionsScreen } from "../screens/ConnectionsScreen";
import { ConsentScreen } from "../screens/ConsentScreen";
import { VerificationScreen } from "../screens/VerificationScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { PublicProfileScreen } from "../screens/PublicProfileScreen";
import { LegalHelpScreen } from "../screens/LegalHelpScreen";
import { AppButton, SectionCard } from "../components";
import { identifyAnalyticsUser, trackPageView } from "../analytics";

function GuidanceScreen({
  title,
  kicker,
  body,
  rows,
  primaryAction,
  onPrimaryAction
}: {
  title: string;
  kicker: string;
  body: string;
  rows: Array<{ title: string; body: string }>;
  primaryAction: string;
  onPrimaryAction: () => void;
}): JSX.Element {
  const styles = useAppStyles();
  return (
    <ScrollView contentContainerStyle={styles.screenScroll}>
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>{kicker}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{body}</Text>
      </View>
      {rows.map((row) => (
        <SectionCard key={row.title} title={row.title}>
          <Text style={styles.cardBodyMuted}>{row.body}</Text>
        </SectionCard>
      ))}
      <AppButton label={primaryAction} onPress={onPrimaryAction} testID={`guidance-${kicker.toLowerCase()}-primary`} />
    </ScrollView>
  );
}

export function AppNavigator({
  accessToken,
  user,
  unreadAlertsCount,
  signOut,
  setUnreadAlertsCount,
  themePreference,
  setThemePreference
}: {
  accessToken: string;
  user: AuthenticatedUser;
  unreadAlertsCount: number;
  signOut: () => void;
  setUnreadAlertsCount: (count: number) => void;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<MobileRouteKey>("home");
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentRoute]);

  useEffect(() => {
    identifyAnalyticsUser(user.analyticsUserId);
  }, [user.analyticsUserId]);

  useEffect(() => {
    trackPageView(currentRoute);
  }, [currentRoute]);

  const navigateTo = (key: MobileRouteKey): void => {
    setSelectedProfileUserId(null);
    setCurrentRoute(key);
  };

  const shellProps = useMemo(
    () => ({
      currentRoute,
      drawerOpen,
      jobsExpanded,
      unreadAlertsCount,
      user,
      themePreference,
      setThemePreference,
      onToggleDrawer: () => setDrawerOpen((open) => !open),
      onToggleJobsExpanded: () => setJobsExpanded((open) => !open),
      onNavigate: navigateTo,
      onSignOut: signOut
    }),
    [currentRoute, drawerOpen, jobsExpanded, unreadAlertsCount, user, themePreference, setThemePreference]
  );

  const renderRoute = (): React.ReactNode => {
    if (selectedProfileUserId) {
      return (
        <PublicProfileScreen
          accessToken={accessToken}
          user={user}
          targetUserId={selectedProfileUserId}
          onBack={() => setSelectedProfileUserId(null)}
          onSessionInvalid={signOut}
        />
      );
    }

    switch (currentRoute) {
      case "home":
        return (
          <HomeScreen
            accessToken={accessToken}
            onSessionInvalid={signOut}
            onOpenJobs={() => navigateTo("jobs-discover")}
          />
        );
      case "people":
        return (
          <ConnectionsScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            onDiscoverProfile={(userId) => setSelectedProfileUserId(userId)}
          />
        );
      case "profile":
        return (
          <ProfileScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            onSignOut={signOut}
          />
        );
      case "verify":
        return <VerificationScreen accessToken={accessToken} onSessionInvalid={signOut} />;
      case "jobs-discover":
        return (
          <JobsScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            section="discover"
          />
        );
      case "jobs-posted":
        return (
          <JobsScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            section="posted"
          />
        );
      case "jobs-assigned":
        return (
          <JobsScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            section="assigned"
          />
        );
      case "alerts":
        return (
          <NotificationsScreen
            accessToken={accessToken}
            onSessionInvalid={signOut}
            onUnreadCountChange={setUnreadAlertsCount}
          />
        );
      case "privacy":
        return <ConsentScreen accessToken={accessToken} user={user} onSessionInvalid={signOut} />;
      case "settings":
        return (
          <GuidanceScreen
            kicker="Settings"
            title="Account preferences"
            body="Keep identity, privacy, and notifications easy to review from one place."
            rows={[
              {
                title: "Human identity",
                body: "Profile details and public media live in Profile, where you can update service details and contact fields."
              },
              {
                title: "Privacy state",
                body: "Contact sharing is controlled from Privacy. You can review active shares and stop them when needed."
              },
              {
                title: "Next safe action",
                body: "Use Alerts for pending requests and verification updates before changing account-level settings."
              }
            ]}
            primaryAction="Open privacy controls"
            onPrimaryAction={() => navigateTo("privacy")}
          />
        );
      case "help":
        return <LegalHelpScreen />;
      default:
        return <HomeScreen accessToken={accessToken} onSessionInvalid={signOut} />;
    }
  };

  return (
    <MobileShell {...shellProps} currentRoute={currentRoute}>
      {renderRoute()}
    </MobileShell>
  );
}
