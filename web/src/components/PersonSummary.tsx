import type { ProfileRecord } from "@/lib/api";

function initialsFrom(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "?";
}

function locationFor(profile: ProfileRecord): string | null {
  return [profile.city, profile.area].filter(Boolean).join(", ") || null;
}

export function personLabel(profile: ProfileRecord | null | undefined): string {
  return profile?.displayName?.trim() || "IllamHelp member";
}

export function personMeta(profile: ProfileRecord | null | undefined, fallbackUserId: string): string {
  if (!profile) return "Member profile details unavailable";
  const parts = [
    locationFor(profile),
    profile.serviceCategories.slice(0, 2).join(", ") || null
  ].filter(Boolean);
  return parts.join(" · ") || `Member ${fallbackUserId}`;
}

export function PersonSummary({
  userId,
  profile,
  label,
  meta,
  compact = false
}: {
  userId: string;
  profile?: ProfileRecord | null;
  label?: string;
  meta?: string | null;
  compact?: boolean;
}): JSX.Element {
  const display = label ?? personLabel(profile);
  const summary = meta ?? personMeta(profile, userId);
  const memberId = profile?.userId ?? userId;

  return (
    <div className={`person-summary ${compact ? "compact" : ""}`}>
      <div className="person-avatar" aria-hidden="true">
        {initialsFrom(display)}
      </div>
      <div className="person-copy">
        <div className="person-name">{display}</div>
        {summary ? <div className="person-meta">{summary}</div> : null}
        <div className="person-id">Member ID: {memberId}</div>
      </div>
    </div>
  );
}
