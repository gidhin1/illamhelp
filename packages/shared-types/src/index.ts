export type UserRole = "seeker" | "provider" | "admin" | "support";

export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export type ConsentField =
  | "phone"
  | "alternate_phone"
  | "email"
  | "full_address";

export type ConsentGrantStatus = "active" | "revoked";

export type MediaKind = "image" | "video";

export type MediaState =
  | "uploaded"
  | "scanning"
  | "ai_reviewed"
  | "human_review_pending"
  | "approved"
  | "rejected"
  | "appeal_pending"
  | "appeal_resolved";

export type ThemePreference = "system" | "dark" | "light";

export type AppNavPlacement = "bottomBar" | "drawer" | "contextual";

export type AppNavIcon =
  | "home"
  | "people"
  | "profile"
  | "verify"
  | "jobs"
  | "alerts"
  | "privacy"
  | "settings"
  | "help"
  | "chevronDown"
  | "chevronRight"
  | "menu"
  | "theme";

export type AppNavRouteKey =
  | "home"
  | "people"
  | "profile"
  | "verify"
  | "jobs"
  | "jobs-discover"
  | "jobs-posted"
  | "jobs-assigned"
  | "alerts"
  | "privacy"
  | "settings"
  | "help";

export interface AppNavItem {
  key: AppNavRouteKey;
  label: string;
  shortLabel: string;
  icon: AppNavIcon;
  placement: AppNavPlacement;
  order: number;
  mobileTitle: string;
  webHref?: string;
  children?: AppNavItem[];
}

export const MOBILE_NAVIGATION: AppNavItem[] = [
  {
    key: "home",
    label: "Home",
    shortLabel: "Home",
    icon: "home",
    placement: "bottomBar",
    order: 1,
    mobileTitle: "Home",
    webHref: "/"
  },
  {
    key: "people",
    label: "People",
    shortLabel: "People",
    icon: "people",
    placement: "bottomBar",
    order: 2,
    mobileTitle: "People",
    webHref: "/connections"
  },
  {
    key: "profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: "profile",
    placement: "bottomBar",
    order: 3,
    mobileTitle: "Profile",
    webHref: "/profile"
  },
  {
    key: "verify",
    label: "Verify",
    shortLabel: "Verify",
    icon: "verify",
    placement: "bottomBar",
    order: 4,
    mobileTitle: "Verify",
    webHref: "/verification"
  },
  {
    key: "jobs",
    label: "Jobs",
    shortLabel: "Jobs",
    icon: "jobs",
    placement: "drawer",
    order: 1,
    mobileTitle: "Jobs",
    webHref: "/jobs/discover",
    children: [
      {
        key: "jobs-discover",
        label: "Discover",
        shortLabel: "Discover",
        icon: "jobs",
        placement: "drawer",
        order: 1,
        mobileTitle: "Jobs",
        webHref: "/jobs/discover"
      },
      {
        key: "jobs-posted",
        label: "Posted by me",
        shortLabel: "Posted",
        icon: "jobs",
        placement: "drawer",
        order: 2,
        mobileTitle: "My Jobs",
        webHref: "/jobs/posted"
      },
      {
        key: "jobs-assigned",
        label: "Assigned to me",
        shortLabel: "Assigned",
        icon: "jobs",
        placement: "drawer",
        order: 3,
        mobileTitle: "Assigned Jobs",
        webHref: "/jobs/assigned"
      }
    ]
  },
  {
    key: "alerts",
    label: "Alerts",
    shortLabel: "Alerts",
    icon: "alerts",
    placement: "drawer",
    order: 2,
    mobileTitle: "Alerts",
    webHref: "/notifications"
  },
  {
    key: "privacy",
    label: "Privacy",
    shortLabel: "Privacy",
    icon: "privacy",
    placement: "drawer",
    order: 3,
    mobileTitle: "Privacy",
    webHref: "/consent"
  },
  {
    key: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: "settings",
    placement: "drawer",
    order: 4,
    mobileTitle: "Settings",
    webHref: "/settings"
  },
  {
    key: "help",
    label: "Help",
    shortLabel: "Help",
    icon: "help",
    placement: "drawer",
    order: 5,
    mobileTitle: "Help",
    webHref: "/help"
  }
];

export const BOTTOM_BAR_NAV = MOBILE_NAVIGATION.filter(
  (item) => item.placement === "bottomBar"
);

export const DRAWER_NAV = MOBILE_NAVIGATION.filter((item) => item.placement === "drawer");
