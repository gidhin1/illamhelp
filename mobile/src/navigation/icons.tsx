import { createElement, type ComponentType } from "react";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  House,
  LockKeyhole,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react-native";

import type { AppNavIcon } from "@illamhelp/shared-types";
import { theme } from "../theme";

type IconProps = {
  name: AppNavIcon;
  size?: number;
  color?: string;
};

type NativeIconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type NativeIconComponent = ComponentType<NativeIconProps>;

const asNativeIcon = (Icon: unknown): NativeIconComponent => Icon as NativeIconComponent;

const iconRenderers: Record<AppNavIcon, NativeIconComponent> = {
  home: asNativeIcon(House),
  people: asNativeIcon(UsersRound),
  profile: asNativeIcon(UserRound),
  verify: asNativeIcon(ShieldCheck),
  jobs: asNativeIcon(BriefcaseBusiness),
  alerts: asNativeIcon(Bell),
  privacy: asNativeIcon(LockKeyhole),
  settings: asNativeIcon(Settings),
  help: asNativeIcon(CircleHelp),
  menu: asNativeIcon(Menu),
  theme: asNativeIcon(Moon),
  chevronDown: asNativeIcon(ChevronDown),
  chevronRight: asNativeIcon(ChevronRight)
};

export function NavIcon({
  name,
  size = 22,
  color = theme.colors.ink
}: IconProps): JSX.Element {
  const Icon = iconRenderers[name] ?? iconRenderers.home;

  return createElement(Icon, { color, size, strokeWidth: 2 }) as JSX.Element;
}
