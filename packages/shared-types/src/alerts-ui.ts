export type AlertDestination = {
  route: "jobs-posted" | "people" | "privacy" | "verify";
  href: string;
  label: string;
};

export function alertCategory(type: string): string {
  if (type.startsWith("job_")) return "Jobs";
  if (type.startsWith("connection_")) return "People";
  if (type.startsWith("verification_")) return "Verification";
  if (type.startsWith("consent_")) return "Contact sharing";
  if (type.startsWith("media_")) return "Media";
  return "IllamHelp";
}

export function alertDestination(type: string, data: Record<string, unknown>): AlertDestination | null {
  if (type.startsWith("connection_")) {
    return { route: "people", href: "/connections#current-people-heading", label: "Open People" };
  }
  if (type.startsWith("consent_")) {
    return { route: "privacy", href: "/consent", label: "Review contact sharing" };
  }
  if (type.startsWith("verification_")) {
    return { route: "verify", href: "/verification", label: "View verification" };
  }
  if (type === "job_application_received" || type === "job_booking_started") {
    const jobId = data.jobId;
    const jobHref = typeof jobId === "string" && /^[\w-]+$/.test(jobId) ? `/jobs/${jobId}` : "/jobs/posted";
    return {
      route: "jobs-posted",
      href: type === "job_application_received" && jobHref !== "/jobs/posted" ? `${jobHref}#job-applicants` : jobHref,
      label: type === "job_application_received" ? "Review applicants" : "Open posted jobs"
    };
  }
  return null;
}
