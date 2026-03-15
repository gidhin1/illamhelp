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

function PlaceholderScreen({
  title,
  body
}: {
  title: string;
  body: string;
}): JSX.Element {
  const styles = useAppStyles();
  return (
    <ScrollView contentContainerStyle={styles.screenScroll}>
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>{title}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{body}</Text>
      </View>
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

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentRoute]);

  const navigateTo = (key: MobileRouteKey): void => {
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
    switch (currentRoute) {
      case "home":
        return (
          <HomeScreen
            accessToken={accessToken}
            onSessionInvalid={signOut}
            onOpenPeople={() => navigateTo("people")}
          />
        );
      case "people":
        return (
          <ConnectionsScreen accessToken={accessToken} user={user} onSessionInvalid={signOut} />
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
          <PlaceholderScreen
            title="Settings"
            body="Theme, notification, and account preferences will live here as the new shell expands."
          />
        );
      case "help":
        return (
          <PlaceholderScreen
            title="Help"
            body="Contextual guidance, support routes, and trust education will live here."
          />
        );
      default:
        return (
          <HomeScreen
            accessToken={accessToken}
            onSessionInvalid={signOut}
            onOpenPeople={() => navigateTo("people")}
          />
        );
    }
  };

  return (
    <MobileShell {...shellProps} currentRoute={currentRoute}>
      {renderRoute()}
    </MobileShell>
  );
}
