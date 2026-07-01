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
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.line
  },
  authTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: theme.colors.ink,
    lineHeight: 36,
    marginTop: 8
  },
  authSubtitle: {
    color: theme.colors.muted,
    marginTop: 8,
    lineHeight: 22
  },
  apiHint: {
    color: theme.colors.muted,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16
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
    fontWeight: "600",
    lineHeight: 18
  },
  modeButtonLabelSelected: {
    color: theme.colors.brandText
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
    color: theme.colors.ink,
    lineHeight: 27
  },
  appSubtitle: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  appContent: {
    flex: 1,
    paddingHorizontal: 16
  },
  screenScroll: {
    paddingTop: 16,
    paddingBottom: 132,
    gap: 12
  },
  screenHeader: {
    gap: 6,
    marginBottom: 8
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.ink,
    lineHeight: 32
  },
  screenSubtitle: {
    color: theme.colors.muted,
    lineHeight: 22
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    color: theme.colors.brandText,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 16,
    gap: 10
  },
  cardTitle: {
    fontWeight: "700",
    color: theme.colors.ink,
    fontSize: 16,
    lineHeight: 21
  },
  cardBody: {
    color: theme.colors.ink,
    lineHeight: 22
  },
  cardBodyMuted: {
    color: theme.colors.muted,
    lineHeight: 22
  },
  stackSmall: {
    gap: 8
  },
  cardCarouselRail: {
    gap: 10,
    paddingRight: 10
  },
  carouselCard: {
    width: 292
  },
  formField: {
    gap: 6
  },
  fieldLabel: {
    fontWeight: "600",
    color: theme.colors.ink,
    fontSize: 13,
    lineHeight: 18
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.ink,
    fontSize: 16,
    lineHeight: 22
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
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
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
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.965 }]
  },
  buttonLabel: {
    color: theme.colors.onStrong,
    fontWeight: "700",
    lineHeight: 18
  },
  buttonLabelGhost: {
    color: theme.colors.ink
  },
  banner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
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
    fontSize: 13,
    lineHeight: 18
  },
  bannerTextError: {
    color: theme.colors.errorText
  },
  bannerTextSuccess: {
    color: theme.colors.successText
  },
  bannerTextInfo: {
    color: theme.colors.brandText
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
    gap: 4,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  kpiLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 16
  },
  kpiValue: {
    color: theme.colors.ink,
    fontWeight: "700",
    fontSize: 20,
    lineHeight: 24,
    marginTop: 4
  },
  dataRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 3,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  dataRowSelected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.brand,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  dataTitle: {
    color: theme.colors.ink,
    fontWeight: "700",
    fontSize: 16,
    lineHeight: 21
  },
  dataMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  mediaPreviewRow: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  mediaCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  mediaCarouselRail: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 10
  },
  mediaPreviewCard: {
    width: 174,
    borderRadius: 12,
    padding: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 7,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  mediaPreviewCardPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: theme.colors.brand
  },
  mediaPreviewFrame: {
    position: "relative",
    width: "100%",
    height: 188,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceHover
  },
  mediaPreviewImage: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.surfaceHover
  },
  mediaPreviewVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  mediaPreviewVideoLabel: {
    color: theme.colors.onStrong,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  mediaPreviewMeta: {
    flex: 1,
    gap: 4
  },
  mediaKindPill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "rgba(26, 22, 37, 0.72)"
  },
  mediaKindPillText: {
    color: theme.colors.onStrong,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14
  },
  mediaPlayPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "rgba(26, 22, 37, 0.72)"
  },
  mediaMaximisePill: {
    position: "absolute",
    right: 8,
    top: 8,
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)"
  },
  mediaMaximiseText: {
    color: theme.colors.ink,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  mediaCarouselDots: {
    minHeight: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6
  },
  mediaCarouselDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.line
  },
  mediaCarouselDotActive: {
    width: 20,
    backgroundColor: theme.colors.brand,
    shadowColor: theme.colors.brand,
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 1
  },
  mediaViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 22, 37, 0.84)",
    justifyContent: "center",
    padding: 16
  },
  mediaViewerPanel: {
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 12,
    gap: 12,
    maxHeight: "90%"
  },
  mediaViewerImage: {
    width: "100%",
    minHeight: 320,
    maxHeight: 520,
    borderRadius: 12,
    backgroundColor: theme.colors.ink
  },
  mediaViewerVideo: {
    minHeight: 320,
    borderRadius: 12,
    backgroundColor: theme.colors.ink,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  mediaUploadPanel: {
    gap: 10
  },
  mediaPickerActions: {
    gap: 8
  },
  mediaSelectedRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    gap: 10,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  mediaSelectedSummary: {
    gap: 3
  },
  mediaSelectionRail: {
    gap: 10,
    paddingVertical: 2
  },
  mediaSelectionCard: {
    width: 148,
    gap: 5
  },
  mediaSelectionFrame: {
    position: "relative",
    width: 148,
    height: 184,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceHover
  },
  mediaSelectionImage: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.surfaceHover
  },
  mediaSelectionVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  mediaFileIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  mediaFileIconText: {
    color: theme.colors.brandText,
    fontWeight: "700",
    lineHeight: 18
  },
  mediaUploadActions: {
    gap: 8
  },
  mediaPendingRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    gap: 3
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
    paddingVertical: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceAlt,
    justifyContent: "center"
  },
  roleChipSelected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.brand,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  roleChipLabel: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
  },
  roleChipLabelSelected: {
    color: theme.colors.brandText
  },
  privacyTaskTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  privacyTaskTab: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface
  },
  privacyTaskTabSelected: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.surfaceAlt,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  privacyTaskTabLabel: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  privacyTaskTabLabelSelected: {
    color: theme.colors.brandText
  },
  privacyTaskTabCount: {
    minWidth: 22,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.brandText,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center"
  },
  privacyTaskTabCountSelected: {
    backgroundColor: theme.colors.surface
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
    backgroundColor: theme.colors.surface,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  tabButtonLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
  },
  tabButtonLabelSelected: {
    color: theme.colors.brandText
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.errorText,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  tabBadgeLabel: {
    color: theme.colors.bg,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12
  },
  statusLabel: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceAlt,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  statusLabelSuccess: {
    borderColor: theme.colors.success
  },
  statusLabelWarning: {
    borderColor: theme.colors.warning
  },
  statusLabelError: {
    borderColor: theme.colors.error
  },
  statusLabelInfo: {
    borderColor: theme.colors.brand
  },
  statusLabelText: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
  },
  statusLabelTextSuccess: {
    color: theme.colors.successText
  },
  statusLabelTextWarning: {
    color: theme.colors.warningText
  },
  statusLabelTextError: {
    color: theme.colors.errorText
  },
  statusLabelTextInfo: {
    color: theme.colors.brandText
  },
  skeletonRow: {
    gap: 8,
    paddingVertical: 4
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceHover
  }
  });
}

export const styles = createAppStyles(defaultTheme);
