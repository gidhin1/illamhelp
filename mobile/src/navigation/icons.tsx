import { StyleSheet, Text, View } from "react-native";

import type { AppNavIcon } from "@illamhelp/shared-types";

type IconProps = {
  name: AppNavIcon;
  size?: number;
  color?: string;
};

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible"
  },
  absolute: {
    position: "absolute"
  },
  question: {
    fontWeight: "800",
    includeFontPadding: false,
    textAlign: "center"
  }
});

function line(
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  rotate?: string
): JSX.Element {
  return (
    <View
      style={[
        styles.absolute,
        {
          left,
          top,
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          transform: rotate ? [{ rotate }] : undefined
        }
      ]}
    />
  );
}

function outlineBox(
  left: number,
  top: number,
  width: number,
  height: number,
  color: string,
  stroke: number,
  radius: number
): JSX.Element {
  return (
    <View
      style={[
        styles.absolute,
        {
          left,
          top,
          width,
          height,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: radius
        }
      ]}
    />
  );
}

function outlineCircle(
  left: number,
  top: number,
  size: number,
  color: string,
  stroke: number
): JSX.Element {
  return outlineBox(left, top, size, size, color, stroke, size / 2);
}

function IconGlyph({
  name,
  size,
  color
}: Required<IconProps>): JSX.Element {
  const stroke = Math.max(1.75, Math.round(size * 0.085));

  switch (name) {
    case "home":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {line(size * 0.16, size * 0.39, size * 0.34, stroke, color, "-45deg")}
          {line(size * 0.50, size * 0.39, size * 0.34, stroke, color, "45deg")}
          {outlineBox(size * 0.24, size * 0.45, size * 0.52, size * 0.34, color, stroke, size * 0.08)}
          {outlineBox(size * 0.45, size * 0.56, size * 0.12, size * 0.23, color, stroke, size * 0.04)}
        </View>
      );
    case "people":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.12, size * 0.24, size * 0.2, color, stroke)}
          {outlineCircle(size * 0.42, size * 0.16, size * 0.24, color, stroke)}
          {outlineBox(size * 0.08, size * 0.52, size * 0.3, size * 0.18, color, stroke, size * 0.12)}
          {outlineBox(size * 0.34, size * 0.5, size * 0.38, size * 0.22, color, stroke, size * 0.14)}
        </View>
      );
    case "profile":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.31, size * 0.15, size * 0.28, color, stroke)}
          {outlineBox(size * 0.2, size * 0.52, size * 0.6, size * 0.2, color, stroke, size * 0.16)}
        </View>
      );
    case "verify":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.12, size * 0.12, size * 0.76, color, stroke)}
          {line(size * 0.31, size * 0.51, size * 0.13, stroke, color, "45deg")}
          {line(size * 0.41, size * 0.57, size * 0.27, stroke, color, "-45deg")}
        </View>
      );
    case "jobs":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineBox(size * 0.16, size * 0.33, size * 0.68, size * 0.42, color, stroke, size * 0.08)}
          {outlineBox(size * 0.34, size * 0.19, size * 0.32, size * 0.16, color, stroke, size * 0.06)}
          {line(size * 0.16, size * 0.48, size * 0.68, stroke, color)}
        </View>
      );
    case "alerts":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineBox(size * 0.25, size * 0.22, size * 0.5, size * 0.42, color, stroke, size * 0.24)}
          {line(size * 0.22, size * 0.64, size * 0.56, stroke, color)}
          {outlineCircle(size * 0.44, size * 0.68, size * 0.08, color, stroke)}
          {line(size * 0.43, size * 0.14, size * 0.14, stroke, color)}
        </View>
      );
    case "privacy":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineBox(size * 0.24, size * 0.42, size * 0.52, size * 0.34, color, stroke, size * 0.08)}
          {outlineBox(size * 0.34, size * 0.18, size * 0.32, size * 0.28, color, stroke, size * 0.18)}
        </View>
      );
    case "settings":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.26, size * 0.26, size * 0.48, color, stroke)}
          {line(size * 0.45, size * 0.02, stroke, size * 0.18, color)}
          {line(size * 0.45, size * 0.8, stroke, size * 0.18, color)}
          {line(size * 0.02, size * 0.45, size * 0.18, stroke, color)}
          {line(size * 0.8, size * 0.45, size * 0.18, stroke, color)}
          {line(size * 0.18, size * 0.18, size * 0.14, stroke, color, "45deg")}
          {line(size * 0.68, size * 0.68, size * 0.14, stroke, color, "45deg")}
          {line(size * 0.68, size * 0.18, size * 0.14, stroke, color, "-45deg")}
          {line(size * 0.18, size * 0.68, size * 0.14, stroke, color, "-45deg")}
        </View>
      );
    case "help":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.14, size * 0.14, size * 0.72, color, stroke)}
          <Text style={[styles.question, { color, fontSize: size * 0.58, lineHeight: size * 0.62 }]}>?</Text>
        </View>
      );
    case "chevronDown":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {line(size * 0.2, size * 0.4, size * 0.24, stroke, color, "35deg")}
          {line(size * 0.44, size * 0.4, size * 0.24, stroke, color, "-35deg")}
        </View>
      );
    case "chevronRight":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {line(size * 0.34, size * 0.28, size * 0.24, stroke, color, "45deg")}
          {line(size * 0.34, size * 0.5, size * 0.24, stroke, color, "-45deg")}
        </View>
      );
    case "menu":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {line(size * 0.16, size * 0.24, size * 0.68, stroke, color)}
          {line(size * 0.16, size * 0.48, size * 0.68, stroke, color)}
          {line(size * 0.16, size * 0.72, size * 0.68, stroke, color)}
        </View>
      );
    case "theme":
      return (
        <View style={[styles.frame, { width: size, height: size }]}>
          {outlineCircle(size * 0.15, size * 0.15, size * 0.7, color, stroke)}
          <View
            style={[
              styles.absolute,
              {
                left: size * 0.5,
                top: size * 0.15,
                width: size * 0.35,
                height: size * 0.7,
                backgroundColor: color,
                borderTopRightRadius: size * 0.35,
                borderBottomRightRadius: size * 0.35
              }
            ]}
          />
        </View>
      );
    default:
      return <View style={[styles.frame, { width: size, height: size }]} />;
  }
}

export function NavIcon({
  name,
  size = 22,
  color = "#1F1D1A"
}: IconProps): JSX.Element {
  return <IconGlyph name={name} size={size} color={color} />;
}
