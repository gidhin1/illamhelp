import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ThemePreference } from "@illamhelp/shared-types";

import { type AuthenticatedUser } from "../api";
import { useAppTheme } from "../theme-context";
import { bottomBarItems, drawerItems, getNavigationItem, isJobsRoute, type MobileRouteKey } from "./registry";
import { NavIcon } from "./icons";

function createShellStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      backgroundColor: colors.bg
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.bg
    },
    headerSide: {
      width: 44,
      alignItems: "center",
      justifyContent: "center"
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: "center"
    },
    headerTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700"
    },
    headerSubtitle: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 1
    },
    content: {
      flex: 1,
      paddingHorizontal: 18
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.bgAlt
    },
    bottomItem: {
      flex: 1,
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18
    },
    bottomItemActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -8,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.error,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4
    },
    badgeLabel: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "700"
    },
    drawerScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.38)"
    },
    drawer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "84%",
      maxWidth: 360,
      backgroundColor: colors.bgAlt,
      borderRightWidth: 1,
      borderRightColor: colors.line,
      shadowColor: colors.shadow,
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 8, height: 0 },
      elevation: 14
    },
    drawerScroll: {
      paddingHorizontal: 18,
      gap: 18
    },
    profileCard: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 10
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.line
    },
    avatarText: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "700"
    },
    profileName: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "800"
    },
    profileHandle: {
      color: colors.muted,
      fontSize: 13
    },
    drawerSectionLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    drawerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14
    },
    drawerItemActive: {
      backgroundColor: colors.surface
    },
    drawerItemLabel: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "600",
      flex: 1
    },
    jobsChildren: {
      gap: 6,
      paddingLeft: 16
    },
    jobsChildItem: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line
    },
    jobsChildActive: {
      backgroundColor: colors.surface,
      borderColor: colors.brand
    },
    jobsChildLabel: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "600"
    },
    themeRow: {
      flexDirection: "row",
      gap: 8
    },
    themeChip: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt
    },
    themeChipActive: {
      backgroundColor: colors.surface,
      borderColor: colors.brand
    },
    themeChipLabel: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "700"
    },
    signOut: {
      marginTop: 10,
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    signOutLabel: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: "700"
    }
  });
}

export function MobileShell({
  currentRoute,
  drawerOpen,
  jobsExpanded,
  unreadAlertsCount,
  user,
  themePreference,
  setThemePreference,
  onToggleDrawer,
  onToggleJobsExpanded,
  onNavigate,
  onSignOut,
  children
}: {
  currentRoute: MobileRouteKey;
  drawerOpen: boolean;
  jobsExpanded: boolean;
  unreadAlertsCount: number;
  user: AuthenticatedUser;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  onToggleDrawer: () => void;
  onToggleJobsExpanded: () => void;
  onNavigate: (key: MobileRouteKey) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const theme = useAppTheme();
  const styles = useMemo(() => createShellStyles(theme.colors), [theme.colors]);
  const insets = useSafeAreaInsets();
  const title = getNavigationItem(currentRoute)?.mobileTitle ?? "IllamHelp";
  const initials = user.publicUserId.slice(0, 1).toUpperCase();

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 2 }]}>
        <Pressable
          onPress={onToggleDrawer}
          style={styles.headerSide}
          accessibilityRole="button"
          testID="app-drawer-toggle"
        >
          <NavIcon name="menu" size={26} color={theme.colors.ink} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>IllamHelp</Text>
        </View>
        <Pressable
          onPress={() => onNavigate("profile")}
          style={styles.headerSide}
          accessibilityRole="button"
          testID="app-header-profile"
        >
          <View style={[styles.avatar, { width: 36, height: 36, borderRadius: 18 }]}>
            <Text style={[styles.avatarText, { fontSize: 14 }]}>{initials}</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) + 2 }]}>
        {bottomBarItems.map((item) => {
          const active = currentRoute === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onNavigate(item.key as MobileRouteKey)}
              style={[styles.bottomItem, active ? styles.bottomItemActive : null]}
              accessibilityRole="button"
              testID={`tab-${item.key}`}
            >
              <View>
                <NavIcon
                  name={item.icon}
                  size={24}
                  color={active ? theme.colors.brand : theme.colors.muted}
                />
                {item.key === "people" && unreadAlertsCount > 0 ? null : null}
                {item.key === "profile" ? null : null}
                {item.key === "verify" ? null : null}
                {item.key === "home" ? null : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {drawerOpen ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={styles.drawerScrim} onPress={onToggleDrawer} testID="app-drawer-scrim" />
          <View style={[styles.drawer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
            <ScrollView contentContainerStyle={styles.drawerScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.profileCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View>
                  <Text style={styles.profileName}>IllamHelp</Text>
                  <Text style={styles.profileHandle}>@{user.publicUserId}</Text>
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Text style={styles.drawerSectionLabel}>Appearance</Text>
                <View style={styles.themeRow}>
                  {(["system", "dark", "light"] as ThemePreference[]).map((preference) => {
                    const active = preference === themePreference;
                    return (
                      <Pressable
                        key={preference}
                        onPress={() => setThemePreference(preference)}
                        style={[styles.themeChip, active ? styles.themeChipActive : null]}
                        testID={`theme-${preference}`}
                      >
                        <Text style={styles.themeChipLabel}>{preference}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Text style={styles.drawerSectionLabel}>Explore</Text>
                {drawerItems.map((item) => {
                  if (item.key === "jobs") {
                    const active = isJobsRoute(currentRoute);
                    return (
                      <View key={item.key} style={{ gap: 8 }}>
                        <Pressable
                          onPress={onToggleJobsExpanded}
                          style={[styles.drawerItem, active ? styles.drawerItemActive : null]}
                          testID="drawer-nav-jobs-toggle"
                        >
                          <NavIcon name={item.icon} size={22} color={active ? theme.colors.brand : theme.colors.ink} />
                          <Text style={styles.drawerItemLabel}>{item.label}</Text>
                          <NavIcon
                            name={jobsExpanded ? "chevronDown" : "chevronRight"}
                            size={18}
                            color={theme.colors.muted}
                          />
                        </Pressable>
                        {jobsExpanded ? (
                          <View style={styles.jobsChildren}>
                            {item.children?.map((child) => {
                              const childActive = child.key === currentRoute;
                              return (
                                <Pressable
                                  key={child.key}
                                  onPress={() => {
                                    onNavigate(child.key as MobileRouteKey);
                                    onToggleDrawer();
                                  }}
                                  style={[styles.jobsChildItem, childActive ? styles.jobsChildActive : null]}
                                  testID={`drawer-nav-${child.key}`}
                                >
                                  <Text style={styles.jobsChildLabel}>{child.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  }

                  const active = item.key === currentRoute;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        onNavigate(item.key as MobileRouteKey);
                        onToggleDrawer();
                      }}
                      style={[styles.drawerItem, active ? styles.drawerItemActive : null]}
                      testID={`drawer-nav-${item.key}`}
                    >
                      <View>
                        <NavIcon
                          name={item.icon}
                          size={22}
                          color={active ? theme.colors.brand : theme.colors.ink}
                        />
                        {item.key === "alerts" && unreadAlertsCount > 0 ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeLabel}>{Math.min(unreadAlertsCount, 99)}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.drawerItemLabel}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={onSignOut} style={styles.signOut} testID="drawer-signout">
                <Text style={styles.signOutLabel}>Sign out</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
