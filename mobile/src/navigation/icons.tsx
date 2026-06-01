import { StyleSheet, View } from "react-native";

import type { AppNavIcon } from "@illamhelp/shared-types";

type IconProps = {
  name: AppNavIcon;
  size?: number;
  color?: string;
};

type ShapeProps = {
  size: number;
  color: string;
};

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center"
  },
  absolute: {
    position: "absolute"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  }
});

function Line({
  color,
  height,
  radius,
  rotate,
  width,
  x = 0,
  y = 0
}: {
  color: string;
  height: number;
  radius?: number;
  rotate?: string;
  width: number;
  x?: number;
  y?: number;
}) {
  return (
    <View
      style={[
        styles.absolute,
        {
          width,
          height,
          borderRadius: radius ?? height / 2,
          backgroundColor: color,
          transform: [{ translateX: x }, { translateY: y }, { rotate: rotate ?? "0deg" }]
        }
      ]}
    />
  );
}

function Box({
  color,
  height,
  radius,
  width,
  x = 0,
  y = 0
}: {
  color: string;
  height: number;
  radius: number;
  width: number;
  x?: number;
  y?: number;
}) {
  return (
    <View
      style={[
        styles.absolute,
        {
          width,
          height,
          borderRadius: radius,
          borderWidth: Math.max(1.5, Math.round(width * 0.08)),
          borderColor: color,
          transform: [{ translateX: x }, { translateY: y }]
        }
      ]}
    />
  );
}

function Dot({
  color,
  diameter,
  x = 0,
  y = 0
}: {
  color: string;
  diameter: number;
  x?: number;
  y?: number;
}) {
  return (
    <View
      style={[
        styles.absolute,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: color,
          transform: [{ translateX: x }, { translateY: y }]
        }
      ]}
    />
  );
}

function HomeIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Line color={color} width={size * 0.5} height={size * 0.09} rotate="-38deg" x={-size * 0.16} y={-size * 0.18} />
      <Line color={color} width={size * 0.5} height={size * 0.09} rotate="38deg" x={size * 0.16} y={-size * 0.18} />
      <Box color={color} width={size * 0.54} height={size * 0.45} radius={size * 0.08} y={size * 0.12} />
    </>
  );
}

function PeopleIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Dot color={color} diameter={size * 0.27} x={-size * 0.13} y={-size * 0.22} />
      <Dot color={color} diameter={size * 0.22} x={size * 0.18} y={-size * 0.17} />
      <Box color={color} width={size * 0.52} height={size * 0.34} radius={size * 0.17} x={-size * 0.08} y={size * 0.16} />
      <Box color={color} width={size * 0.36} height={size * 0.27} radius={size * 0.14} x={size * 0.22} y={size * 0.19} />
    </>
  );
}

function ProfileIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Dot color={color} diameter={size * 0.3} y={-size * 0.2} />
      <Box color={color} width={size * 0.58} height={size * 0.36} radius={size * 0.18} y={size * 0.18} />
    </>
  );
}

function VerifyIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Box color={color} width={size * 0.62} height={size * 0.72} radius={size * 0.12} y={-size * 0.01} />
      <Line color={color} width={size * 0.25} height={size * 0.09} rotate="44deg" x={-size * 0.08} y={size * 0.08} />
      <Line color={color} width={size * 0.43} height={size * 0.09} rotate="-45deg" x={size * 0.11} y={size * 0.02} />
    </>
  );
}

function JobsIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Box color={color} width={size * 0.68} height={size * 0.48} radius={size * 0.08} y={size * 0.08} />
      <Box color={color} width={size * 0.28} height={size * 0.16} radius={size * 0.05} y={-size * 0.25} />
      <Line color={color} width={size * 0.7} height={size * 0.08} y={size * 0.03} />
    </>
  );
}

function AlertsIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Box color={color} width={size * 0.52} height={size * 0.58} radius={size * 0.26} y={-size * 0.03} />
      <Line color={color} width={size * 0.62} height={size * 0.08} y={size * 0.25} />
      <Dot color={color} diameter={size * 0.12} y={size * 0.36} />
    </>
  );
}

function PrivacyIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Box color={color} width={size * 0.58} height={size * 0.42} radius={size * 0.07} y={size * 0.12} />
      <Box color={color} width={size * 0.38} height={size * 0.42} radius={size * 0.18} y={-size * 0.16} />
    </>
  );
}

function SettingsIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Dot color={color} diameter={size * 0.22} />
      {[0, 45, 90, 135].map((degree) => (
        <Line key={degree} color={color} width={size * 0.74} height={size * 0.08} rotate={`${degree}deg`} />
      ))}
    </>
  );
}

function HelpIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Box color={color} width={size * 0.68} height={size * 0.68} radius={size * 0.34} />
      <Line color={color} width={size * 0.22} height={size * 0.08} y={-size * 0.13} />
      <Line color={color} width={size * 0.08} height={size * 0.24} y={size * 0.02} />
      <Dot color={color} diameter={size * 0.08} y={size * 0.22} />
    </>
  );
}

function MenuIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Line color={color} width={size * 0.66} height={size * 0.08} y={-size * 0.22} />
      <Line color={color} width={size * 0.66} height={size * 0.08} />
      <Line color={color} width={size * 0.66} height={size * 0.08} y={size * 0.22} />
    </>
  );
}

function ThemeIcon({ color, size }: ShapeProps) {
  return (
    <>
      <Dot color={color} diameter={size * 0.24} />
      {[0, 45, 90, 135].map((degree) => (
        <Line key={degree} color={color} width={size * 0.7} height={size * 0.07} rotate={`${degree}deg`} />
      ))}
    </>
  );
}

function ChevronIcon({ color, size, direction }: ShapeProps & { direction: "down" | "right" }) {
  const rotateA = direction === "down" ? "45deg" : "-45deg";
  const rotateB = direction === "down" ? "-45deg" : "45deg";
  const offset = direction === "down" ? size * 0.1 : 0;

  return (
    <>
      <Line color={color} width={size * 0.38} height={size * 0.09} rotate={rotateA} x={direction === "down" ? -offset : size * 0.06} y={direction === "down" ? 0 : -offset} />
      <Line color={color} width={size * 0.38} height={size * 0.09} rotate={rotateB} x={direction === "down" ? offset : size * 0.06} y={direction === "down" ? 0 : offset} />
    </>
  );
}

const iconRenderers: Record<AppNavIcon, (props: ShapeProps) => JSX.Element> = {
  home: HomeIcon,
  people: PeopleIcon,
  profile: ProfileIcon,
  verify: VerifyIcon,
  jobs: JobsIcon,
  alerts: AlertsIcon,
  privacy: PrivacyIcon,
  settings: SettingsIcon,
  help: HelpIcon,
  menu: MenuIcon,
  theme: ThemeIcon,
  chevronDown: (props) => <ChevronIcon {...props} direction="down" />,
  chevronRight: (props) => <ChevronIcon {...props} direction="right" />
};

export function NavIcon({
  name,
  size = 22,
  color = "#1F1D1A"
}: IconProps): JSX.Element {
  const Icon = iconRenderers[name] ?? iconRenderers.home;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.root,
        {
          width: size,
          height: size
        }
      ]}
    >
      <Icon size={size} color={color} />
    </View>
  );
}
