import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewProps,
  type ViewStyle
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ThemePreference } from "@illamhelp/shared-types";

import { type AuthenticatedUser } from "../api";
import { useReduceMotion } from "../components";
import { useAppTheme } from "../theme-context";
import { bottomBarItems, drawerItems, getNavigationItem, isJobsRoute, type MobileRouteKey } from "./registry";
import { NavIcon } from "./icons";

const AnimatedView = Animated.View as React.ComponentType<
  ViewProps & {
    style?: StyleProp<ViewStyle>;
  }
>;

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
    pressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }]
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
      borderRadius: 12,
      gap: 3
    },
    bottomItemActive: {
      backgroundColor: colors.surface
    },
    navIconShell: {
      width: 34,
      height: 30,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent"
    },
    navIconShellActive: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line
    },
    bottomItemLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "600"
    },
    bottomItemLabelActive: {
      color: colors.brandText
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -8,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.errorText,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4
    },
    badgeLabel: {
      color: colors.bg,
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
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 2, height: 0 },
      elevation: 4
    },
    drawerScroll: {
      paddingHorizontal: 18,
      gap: 18
    },
    profileCard: {
      borderRadius: 12,
      padding: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 10
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 12,
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
      fontWeight: "700"
    },
    profileHandle: {
      color: colors.muted,
      fontSize: 13
    },
    drawerSectionLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600"
    },
    drawerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14
    },
    drawerItemActive: {
      backgroundColor: colors.surface
    },
    drawerIconShell: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.line
    },
    drawerIconShellActive: {
      backgroundColor: colors.surface,
      borderColor: colors.brand
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
      borderRadius: 8,
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
      borderRadius: 12,
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
  const reduceMotion = useReduceMotion();
  const [drawerVisible, setDrawerVisible] = useState(drawerOpen);
  const drawerProgress = useSharedValue(drawerOpen ? 1 : 0);
  const drawerDragX = useSharedValue(0);

  useEffect(() => {
    const duration = reduceMotion ? 0 : theme.motion.duration.drawer;

    if (drawerOpen) {
      setDrawerVisible(true);
      drawerDragX.value = 0;
      drawerProgress.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic)
      });
      return;
    }

    drawerDragX.value = 0;
    drawerProgress.value = withTiming(
      0,
      {
        duration: reduceMotion ? 0 : theme.motion.duration.exit,
        easing: Easing.out(Easing.cubic)
      },
      (finished) => {
        if (finished) {
          runOnJS(setDrawerVisible)(false);
        }
      }
    );
  }, [drawerDragX, drawerOpen, drawerProgress, reduceMotion, theme.motion.duration.drawer, theme.motion.duration.exit]);

  const drawerScrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerProgress.value, [0, 1], [0, 1])
  }));

  const drawerPanelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(drawerProgress.value, [0, 1], [-360, 0]) + drawerDragX.value
      }
    ]
  }));

  const drawerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onUpdate((event) => {
          drawerDragX.value = Math.max(Math.min(event.translationX, 0), -360);
        })
        .onEnd((event) => {
          const shouldClose = event.translationX < -88 || event.velocityX < -450;
          if (shouldClose) {
            drawerDragX.value = withTiming(-360, {
              duration: reduceMotion ? 0 : theme.motion.duration.exit,
              easing: Easing.out(Easing.cubic)
            });
            drawerProgress.value = withTiming(
              0,
              {
                duration: reduceMotion ? 0 : theme.motion.duration.exit,
                easing: Easing.out(Easing.cubic)
              },
              (finished) => {
                if (finished) {
                  runOnJS(onToggleDrawer)();
                }
              }
            );
            return;
          }

          drawerDragX.value = withTiming(0, {
            duration: reduceMotion ? 0 : theme.motion.duration.state,
            easing: Easing.out(Easing.cubic)
          });
        }),
    [drawerDragX, drawerProgress, onToggleDrawer, reduceMotion, theme.motion.duration.exit, theme.motion.duration.state]
  );

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 2 }]}>
        <Pressable
          onPress={onToggleDrawer}
          style={({ pressed }) => [styles.headerSide, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          accessibilityState={{ expanded: drawerOpen }}
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
          style={({ pressed }) => [styles.headerSide, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
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
          const active = item.key === "jobs-discover" ? isJobsRoute(currentRoute) : currentRoute === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onNavigate(item.key as MobileRouteKey)}
              style={({ pressed }) => [
                styles.bottomItem,
                active ? styles.bottomItemActive : null,
                pressed ? styles.pressed : null
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              testID={`tab-${item.key}`}
            >
              <View
                style={[
                  styles.navIconShell,
                  active ? styles.navIconShellActive : null
                ]}
              >
                <NavIcon
                  name={item.icon}
                  size={24}
                  color={active ? theme.colors.brand : theme.colors.muted}
                />
              </View>
              <Text style={[styles.bottomItemLabel, active ? styles.bottomItemLabelActive : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {drawerVisible ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <AnimatedView style={[styles.drawerScrim, drawerScrimStyle]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" style={StyleSheet.absoluteFill} onPress={onToggleDrawer} testID="app-drawer-scrim" />
          </AnimatedView>
          <GestureDetector gesture={drawerPanGesture}>
            <AnimatedView accessibilityViewIsModal accessible={false} style={[styles.drawer, drawerPanelStyle, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
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
                          style={({ pressed }) => [
                            styles.themeChip,
                            active ? styles.themeChipActive : null,
                            pressed ? styles.pressed : null
                          ]}
                          testID={`theme-${preference}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${preference} theme`}
                          accessibilityState={{ selected: active }}
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
                            style={({ pressed }) => [
                              styles.drawerItem,
                              active ? styles.drawerItemActive : null,
                              pressed ? styles.pressed : null
                            ]}
                            testID="drawer-nav-jobs-toggle"
                            accessibilityRole="button"
                            accessibilityLabel="Jobs"
                            accessibilityState={{ expanded: jobsExpanded, selected: active }}
                          >
                            <View style={[styles.drawerIconShell, active ? styles.drawerIconShellActive : null]}>
                              <NavIcon name={item.icon} size={22} color={active ? theme.colors.brand : theme.colors.ink} />
                            </View>
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
                                    style={({ pressed }) => [
                                      styles.jobsChildItem,
                                      childActive ? styles.jobsChildActive : null,
                                      pressed ? styles.pressed : null
                                    ]}
                                    testID={`drawer-nav-${child.key}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={child.label}
                                    accessibilityState={{ selected: childActive }}
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
                        style={({ pressed }) => [
                          styles.drawerItem,
                          active ? styles.drawerItemActive : null,
                          pressed ? styles.pressed : null
                        ]}
                        testID={`drawer-nav-${item.key}`}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                      >
                        <View style={[styles.drawerIconShell, active ? styles.drawerIconShellActive : null]}>
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

                <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed ? styles.pressed : null]} testID="drawer-signout">
                  <Text style={styles.signOutLabel}>Sign out</Text>
                </Pressable>
              </ScrollView>
            </AnimatedView>
          </GestureDetector>
        </View>
      ) : null}
    </View>
  );
}
