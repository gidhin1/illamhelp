export type UserRole = "seeker" | "provider" | "admin" | "support";

export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export type ConsentField =
  | "phone"
  | "alternate_phone"
  | "email"
  | "full_address";

export type ConsentGrantStatus = "active" | "revoked";

export type MediaKind = "image" | "video";

export type MediaContext =
  | "profile_gallery"
  | "profile_avatar"
  | "job_attachment"
  | "verification_document";

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

export type SkillProficiency = "beginner" | "intermediate" | "advanced" | "expert";

export type ServiceSkillSource = "catalog" | "custom";

export interface ServiceSkill {
  jobName: string;
  proficiency: SkillProficiency;
  source: ServiceSkillSource;
}

export interface ServiceCatalogOption {
  value: string;
  label: string;
  group: string;
}

export const SERVICE_PROFICIENCIES: SkillProficiency[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert"
];

export const HOME_SERVICE_CATALOG: ServiceCatalogOption[] = [
  { value: "plumbing", label: "Plumbing", group: "Repairs" },
  { value: "electrical", label: "Electrical", group: "Repairs" },
  { value: "carpentry", label: "Carpentry", group: "Repairs" },
  { value: "painting", label: "Painting", group: "Repairs" },
  { value: "wall putty", label: "Wall putty", group: "Repairs" },
  { value: "tiling", label: "Tiling", group: "Repairs" },
  { value: "masonry", label: "Masonry", group: "Repairs" },
  { value: "welding", label: "Welding", group: "Repairs" },
  { value: "locksmith", label: "Locksmith", group: "Repairs" },
  { value: "appliance repair", label: "Appliance repair", group: "Repairs" },
  { value: "ac service", label: "AC service", group: "Repairs" },
  { value: "water purifier / ro service", label: "Water purifier / RO service", group: "Repairs" },
  { value: "inverter / ups service", label: "Inverter / UPS service", group: "Repairs" },
  { value: "cctv / camera installation", label: "CCTV / camera installation", group: "Repairs" },
  { value: "furniture assembly", label: "Furniture assembly", group: "Repairs" },
  { value: "curtain / blind installation", label: "Curtain / blind installation", group: "Repairs" },

  { value: "cleaning", label: "Cleaning", group: "Cleaning & Housekeeping" },
  { value: "deep cleaning", label: "Deep cleaning", group: "Cleaning & Housekeeping" },
  { value: "bathroom cleaning", label: "Bathroom cleaning", group: "Cleaning & Housekeeping" },
  { value: "kitchen cleaning", label: "Kitchen cleaning", group: "Cleaning & Housekeeping" },
  { value: "sofa cleaning", label: "Sofa cleaning", group: "Cleaning & Housekeeping" },
  { value: "mattress cleaning", label: "Mattress cleaning", group: "Cleaning & Housekeeping" },
  { value: "carpet cleaning", label: "Carpet cleaning", group: "Cleaning & Housekeeping" },
  { value: "window cleaning", label: "Window cleaning", group: "Cleaning & Housekeeping" },
  { value: "laundry", label: "Laundry", group: "Cleaning & Housekeeping" },
  { value: "ironing", label: "Ironing", group: "Cleaning & Housekeeping" },
  { value: "dishwashing", label: "Dishwashing", group: "Cleaning & Housekeeping" },
  { value: "housekeeping", label: "Housekeeping", group: "Cleaning & Housekeeping" },

  { value: "childcare", label: "Childcare", group: "Care" },
  { value: "babysitting", label: "Babysitting", group: "Care" },
  { value: "elder care", label: "Elder care", group: "Care" },
  { value: "home nursing", label: "Home nursing", group: "Care" },
  { value: "patient care attendant", label: "Patient care attendant", group: "Care" },
  { value: "disability support", label: "Disability support", group: "Care" },
  { value: "pet care", label: "Pet care", group: "Care" },

  { value: "cooking", label: "Cooking", group: "Cooking & Food" },
  { value: "meal prep", label: "Meal prep", group: "Cooking & Food" },
  { value: "baking", label: "Baking", group: "Cooking & Food" },
  { value: "catering support", label: "Catering support", group: "Cooking & Food" },

  { value: "gardening", label: "Gardening", group: "Outdoor & Utility" },
  { value: "landscaping", label: "Landscaping", group: "Outdoor & Utility" },
  { value: "pest control", label: "Pest control", group: "Outdoor & Utility" },
  { value: "car washing", label: "Car washing", group: "Outdoor & Utility" },
  { value: "terrace / outdoor cleaning", label: "Terrace / outdoor cleaning", group: "Outdoor & Utility" },

  { value: "driver", label: "Driver", group: "Home Support" },
  { value: "security", label: "Security", group: "Home Support" },
  { value: "moving help", label: "Moving help", group: "Home Support" },
  { value: "packing / unpacking", label: "Packing / unpacking", group: "Home Support" },
  { value: "errands", label: "Errands", group: "Home Support" },
  { value: "grocery assistance", label: "Grocery assistance", group: "Home Support" },

  { value: "arts & crafts", label: "Arts & crafts", group: "Creative / In-home Personal Services" },
  { value: "wall art / mural", label: "Wall art / mural", group: "Creative / In-home Personal Services" },
  { value: "tailoring / stitching", label: "Tailoring / stitching", group: "Creative / In-home Personal Services" },
  { value: "beautician services", label: "Beautician services", group: "Creative / In-home Personal Services" },
  { value: "mehendi / henna", label: "Mehendi / henna", group: "Creative / In-home Personal Services" },
  { value: "home tutoring", label: "Home tutoring", group: "Creative / In-home Personal Services" },
  { value: "music lessons", label: "Music lessons", group: "Creative / In-home Personal Services" },

  { value: "other", label: "Other", group: "Custom" }
];

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
