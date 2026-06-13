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

const iconRenderers = {
  home: House,
  people: UsersRound,
  profile: UserRound,
  verify: ShieldCheck,
  jobs: BriefcaseBusiness,
  alerts: Bell,
  privacy: LockKeyhole,
  settings: Settings,
  help: CircleHelp,
  menu: Menu,
  theme: Moon,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight
} satisfies Record<AppNavIcon, typeof House>;

export function NavIcon({
  name,
  size = 22,
  color = theme.colors.ink
}: IconProps): JSX.Element {
  const Icon = iconRenderers[name] ?? House;

  return (
    <Icon
      color={color}
      size={size}
      strokeWidth={2}
    />
  );
}
