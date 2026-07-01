"use client";

import { useEffect } from "react";

import type { AnalyticsEventName, AnalyticsParamsByEvent } from "@illamhelp/shared-types";

import { trackEvent } from "@/lib/analytics";

export function AnalyticsViewTracker<TName extends AnalyticsEventName>({
  event,
  params
}: {
  event: TName;
  params: Omit<AnalyticsParamsByEvent[TName], "schema_version">;
}): null {
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stableParams = JSON.parse(paramsKey) as Omit<AnalyticsParamsByEvent[TName], "schema_version">;
      trackEvent(event, stableParams);
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [event, paramsKey]);

  return null;
}
