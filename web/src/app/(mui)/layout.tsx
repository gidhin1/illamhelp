import type { ReactNode } from "react";

import MuiRouteProvider from "@/components/MuiRouteProvider";

export default function MuiLayout({ children }: { children: ReactNode }) {
  return <MuiRouteProvider>{children}</MuiRouteProvider>;
}
