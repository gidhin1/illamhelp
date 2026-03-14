import {
  BOTTOM_BAR_NAV,
  DRAWER_NAV,
  MOBILE_NAVIGATION,
  type AppNavItem,
  type AppNavRouteKey
} from "@illamhelp/shared-types";

export type MobileRouteKey = Exclude<AppNavRouteKey, "jobs">;

export const bottomBarItems = BOTTOM_BAR_NAV;
export const drawerItems = DRAWER_NAV;

export function getNavigationItem(key: AppNavRouteKey): AppNavItem | undefined {
  for (const item of MOBILE_NAVIGATION) {
    if (item.key === key) {
      return item;
    }
    const child = item.children?.find((candidate) => candidate.key === key);
    if (child) {
      return child;
    }
  }
  return undefined;
}

export function isJobsRoute(key: MobileRouteKey): boolean {
  return key === "jobs-discover" || key === "jobs-posted" || key === "jobs-assigned";
}
