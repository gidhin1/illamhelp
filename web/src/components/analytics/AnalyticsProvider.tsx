"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/components/session/SessionProvider";
import {
  applyAnalyticsConsent,
  captureUtmFromLocation,
  identifyAnalyticsUser,
  readAnalyticsConsent,
  trackPageView
} from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();

  useEffect(() => {
    captureUtmFromLocation();
  }, []);

  useEffect(() => {
    applyAnalyticsConsent(readAnalyticsConsent());
  }, []);

  useEffect(() => {
    identifyAnalyticsUser(user?.analyticsUserId);
  }, [user?.analyticsUserId]);

  useEffect(() => {
    const query = searchParams.toString();
    trackPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return <>{children}</>;
}
