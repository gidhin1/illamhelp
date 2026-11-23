import type { ReactNode } from "react";

import { NavBar } from "./NavBar";

export function PageShell({ children, unreadCount }: { children: ReactNode; unreadCount?: number }): JSX.Element {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <NavBar unreadCount={unreadCount} />
      <main className="main-feed" id="main-content">
        {children}
      </main>
    </div>
  );
}
