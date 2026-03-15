import { Image, Text, View } from "react-native";

import type { ConnectionAvatarSummary, ProfileAvatarRecord } from "./api";
import { useAppTheme } from "./theme-context";

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
  emptyState = "initials"
}: {
  name: string;
  avatar: ConnectionAvatarSummary | ProfileAvatarRecord | null;
  size?: number;
  emptyState?: "initials" | "placeholder";
}): JSX.Element {
  const theme = useAppTheme();

  if (avatar?.downloadUrl) {
    return (
      <Image
        source={{ uri: avatar.downloadUrl }}
        accessibilityLabel={`${name} avatar`}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: theme.colors.line
        }}
      />
    );
  }

  if (emptyState === "placeholder") {
    return (
      <View
        testID="member-avatar-placeholder"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: "#F3F2F8",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 18
        }}
      >
        <View
          style={{
            width: size * 0.27,
            height: size * 0.27,
            borderRadius: size * 0.135,
            backgroundColor: "#C8C4D7",
            marginBottom: size * 0.07
          }}
        />
        <View
          style={{
            width: size * 0.48,
            height: size * 0.25,
            borderRadius: size * 0.16,
            backgroundColor: "#D6D2E3"
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.surfaceAlt
      }}
    >
      <Text
        style={{
          color: theme.colors.ink,
          fontWeight: "800",
          fontSize: Math.max(14, Math.round(size * 0.3))
        }}
      >
        {initialsFromName(name)}
      </Text>
    </View>
  );
}
