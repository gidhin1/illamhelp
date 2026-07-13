"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";

import { useSession } from "@/components/session/SessionProvider";
import {
  applyAnalyticsConsent,
  captureUtmFromLocation,
  identifyAnalyticsUser,
  readAnalyticsConsent,
  trackPageView
} from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <AnalyticsEffects />
      </Suspense>
    </>
  );
}

function AnalyticsEffects(): null {
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

  return null;
}
