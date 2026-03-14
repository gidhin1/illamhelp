import { StyleSheet } from "react-native";
import type { AppTheme } from "./theme";
import { theme as defaultTheme } from "./theme";

export function createAppStyles(theme: AppTheme) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg
  },
  authContainer: {
    paddingHorizontal: 20,
    paddingBottom: 80,
    paddingTop: 22,
    gap: 14
  },
  authHero: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.line
  },
  authTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: theme.colors.ink,
    marginTop: 8
  },
  authSubtitle: {
    color: theme.colors.muted,
    marginTop: 8,
    lineHeight: 20
  },
  apiHint: {
    color: theme.colors.muted,
    marginTop: 10,
    fontSize: 12
  },
  modeSwitch: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.line
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  modeButtonSelected: {
    backgroundColor: theme.colors.surface
  },
  modeButtonLabel: {
    color: theme.colors.muted,
    fontWeight: "600"
  },
  modeButtonLabelSelected: {
    color: theme.colors.brand
  },
  appTopBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    backgroundColor: theme.colors.bg
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.ink
  },
  appSubtitle: {
    color: theme.colors.muted
  },
  appContent: {
    flex: 1,
    paddingHorizontal: 16
  },
  screenScroll: {
    paddingTop: 16,
    paddingBottom: 80,
    gap: 12
  },
  screenHeader: {
    gap: 6,
    marginBottom: 8
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.ink
  },
  screenSubtitle: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    color: theme.colors.brand,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "600"
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 16,
    gap: 10
  },
  cardTitle: {
    fontWeight: "700",
    color: theme.colors.ink,
    fontSize: 16
  },
  cardBody: {
    color: theme.colors.ink,
    lineHeight: 20
  },
  cardBodyMuted: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  stackSmall: {
    gap: 8
  },
  formField: {
    gap: 6
  },
  fieldLabel: {
    fontWeight: "600",
    color: theme.colors.ink,
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.ink
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: "top"
  },
  button: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: theme.colors.brand
  },
  buttonSecondary: {
    backgroundColor: theme.colors.brandAlt
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.line
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonLabel: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonLabelGhost: {
    color: theme.colors.ink
  },
  banner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1
  },
  bannerError: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.error
  },
  bannerSuccess: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.success
  },
  bannerInfo: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.brand
  },
  bannerText: {
    fontSize: 13
  },
  bannerTextError: {
    color: theme.colors.error
  },
  bannerTextSuccess: {
    color: theme.colors.success
  },
  bannerTextInfo: {
    color: theme.colors.brand
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 10
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 4
  },
  kpiLabel: {
    color: theme.colors.muted,
    fontSize: 12
  },
  kpiValue: {
    color: theme.colors.ink,
    fontWeight: "700",
    fontSize: 20,
    marginTop: 4
  },
  dataRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 3
  },
  dataTitle: {
    color: theme.colors.ink,
    fontWeight: "700"
  },
  dataMeta: {
    color: theme.colors.muted,
    fontSize: 12
  },
  notificationMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  notificationRowUnread: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.surface
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  roleChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceAlt
  },
  roleChipSelected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.brand
  },
  roleChipLabel: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  roleChipLabelSelected: {
    color: theme.colors.brand
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 4,
    paddingVertical: 6,
    paddingBottom: 10
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8
  },
  tabButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  tabButtonSelected: {
    backgroundColor: theme.colors.surface
  },
  tabButtonLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  tabButtonLabelSelected: {
    color: theme.colors.brand
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#8c1d18",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  tabBadgeLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  }
  });
}

export const styles = createAppStyles(defaultTheme);
