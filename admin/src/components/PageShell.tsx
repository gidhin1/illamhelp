import type { ReactNode } from "react";

import { NavBar } from "./NavBar";

export function PageShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="page-shell">
      <NavBar />
      <main className="main-feed">
        {children}
      </main>
    </div>
  );
}
