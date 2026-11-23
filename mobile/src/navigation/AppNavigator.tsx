import type { JSX } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import type { ThemePreference } from "@illamhelp/shared-types";

import { AuthenticatedUser } from "../api";
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
import { SettingsScreen } from "../screens/SettingsScreen";
import { identifyAnalyticsUser, trackPageView } from "../analytics";

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
    switch (currentRoute) {
      case "home":
        return (
          <HomeScreen
            accessToken={accessToken}
            onSessionInvalid={signOut}
            onNavigate={navigateTo}
          />
        );
      case "people":
        return (
          <>
            <View style={selectedProfileUserId ? { display: "none" } : { flex: 1 }}>
              <ConnectionsScreen
                accessToken={accessToken}
                user={user}
                active={!selectedProfileUserId}
                onSessionInvalid={signOut}
                onDiscoverProfile={setSelectedProfileUserId}
              />
            </View>
            {selectedProfileUserId ? (
              <PublicProfileScreen
                accessToken={accessToken}
                user={user}
                targetUserId={selectedProfileUserId}
                onBack={() => setSelectedProfileUserId(null)}
                onSessionInvalid={signOut}
              />
            ) : null}
          </>
        );
      case "profile":
        return (
          <ProfileScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            onSignOut={signOut}
            onManageSharing={() => navigateTo("privacy")}
            onOpenVerification={() => navigateTo("verify")}
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
            onOpen={navigateTo}
          />
        );
      case "privacy":
        return <ConsentScreen accessToken={accessToken} user={user} onSessionInvalid={signOut} />;
      case "settings":
        return <SettingsScreen onOpen={navigateTo} />;
      case "help":
        return <LegalHelpScreen onOpen={navigateTo} />;
      default:
        return <HomeScreen accessToken={accessToken} onSessionInvalid={signOut} onNavigate={navigateTo} />;
    }
  };

  return (
    <MobileShell {...shellProps} currentRoute={currentRoute}>
      {renderRoute()}
    </MobileShell>
  );
}
