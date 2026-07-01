export * from "./analytics";
export * from "./legal";

export type UserRole = "seeker" | "provider" | "admin" | "support";

export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export type ConsentField =
  | "phone"
  | "alternate_phone"
  | "email"
  | "full_address";

export type ConsentGrantStatus = "active" | "revoked";

export type MediaKind = "image" | "video";

export type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataDto
  | MetadataValue[];

export interface MetadataDto {
  [key: string]: MetadataValue;
}

export interface CursorPageDto<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export interface JobDto {
  id: string;
  seekerUserId: string;
  category: string;
  title: string;
  description: string;
  locationText: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
  seekerRating: number | null;
  visibility: "public" | "connections_only";
  status:
    | "posted"
    | "accepted"
    | "in_progress"
    | "completed"
    | "payment_done"
    | "payment_received"
    | "closed"
    | "cancelled";
  assignedProviderUserId: string | null;
  acceptedApplicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobApplicationDto {
  id: string;
  jobId: string;
  providerUserId: string;
  status: "applied" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

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
    placement: "drawer",
    order: 2,
    mobileTitle: "People",
    webHref: "/connections"
  },
  {
    key: "jobs-discover",
    label: "Jobs",
    shortLabel: "Jobs",
    icon: "jobs",
    placement: "bottomBar",
    order: 2,
    mobileTitle: "Jobs",
    webHref: "/jobs/discover"
  },
  {
    key: "privacy",
    label: "Privacy",
    shortLabel: "Privacy",
    icon: "privacy",
    placement: "bottomBar",
    order: 3,
    mobileTitle: "Privacy",
    webHref: "/consent"
  },
  {
    key: "profile",
    label: "Profile",
    shortLabel: "Profile",
    icon: "profile",
    placement: "bottomBar",
    order: 4,
    mobileTitle: "Profile",
    webHref: "/profile"
  },
  {
    key: "verify",
    label: "Verify",
    shortLabel: "Verify",
    icon: "verify",
    placement: "drawer",
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
    order: 3,
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
    order: 5,
    mobileTitle: "Alerts",
    webHref: "/notifications"
  },
  {
    key: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: "settings",
    placement: "drawer",
    order: 6,
    mobileTitle: "Settings",
    webHref: "/settings"
  },
  {
    key: "help",
    label: "Help",
    shortLabel: "Help",
    icon: "help",
    placement: "drawer",
    order: 7,
    mobileTitle: "Help",
    webHref: "/help"
  }
];

export const BOTTOM_BAR_NAV = MOBILE_NAVIGATION.filter(
  (item) => item.placement === "bottomBar"
).sort((a, b) => a.order - b.order);

export const DRAWER_NAV = MOBILE_NAVIGATION.filter((item) => item.placement === "drawer").sort(
  (a, b) => a.order - b.order
);
