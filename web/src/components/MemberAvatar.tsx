"use client";

import type { CSSProperties } from "react";
import Image from "next/image";

import type { ConnectionAvatarSummary, ProfileAvatarRecord } from "@/lib/api";

function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return "?";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function MemberAvatar({
  name,
  avatar,
  size = 56,
  style,
  emptyState = "initials"
}: {
  name: string;
  avatar: ConnectionAvatarSummary | ProfileAvatarRecord | null;
  size?: number;
  style?: CSSProperties;
  emptyState?: "initials" | "placeholder";
}): JSX.Element {
  const sharedStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size / 2,
    border: "1px solid var(--line)",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(145deg, color-mix(in srgb, var(--brand) 16%, var(--surface)), color-mix(in srgb, var(--brand-2) 18%, var(--surface)))",
    color: "var(--ink)",
    fontWeight: 800,
    fontSize: Math.max(14, Math.round(size * 0.3)),
    boxShadow: "var(--shadow-soft)",
    ...style
  };

  if (avatar?.downloadUrl) {
    return (
      <Image
        src={avatar.downloadUrl}
        alt={`${name} avatar`}
        width={size}
        height={size}
        unoptimized
        style={{
          ...sharedStyle,
          objectFit: "cover"
        }}
      />
    );
  }

  if (emptyState === "placeholder") {
    const shellStyle: CSSProperties = {
      ...sharedStyle,
      position: "relative",
      background:
        "linear-gradient(145deg, color-mix(in srgb, var(--surface-alt) 84%, white), color-mix(in srgb, var(--surface) 88%, white))",
      border: "1px solid color-mix(in srgb, var(--line) 82%, white)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.68), 0 14px 30px rgba(18, 16, 32, 0.08)"
    };
    const headSize = size * 0.26;
    const torsoWidth = size * 0.46;
    const torsoHeight = size * 0.24;

    return (
      <div style={shellStyle} data-testid="member-avatar-placeholder">
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "24%",
            width: headSize,
            height: headSize,
            borderRadius: headSize / 2,
            background: "color-mix(in srgb, var(--muted) 35%, white)"
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "20%",
            width: torsoWidth,
            height: torsoHeight,
            borderRadius: `${torsoHeight}px ${torsoHeight}px ${torsoHeight * 0.7}px ${torsoHeight * 0.7}px`,
            background: "color-mix(in srgb, var(--muted) 26%, white)"
          }}
        />
      </div>
    );
  }

  return <div style={sharedStyle}>{initialsFromName(name)}</div>;
}
