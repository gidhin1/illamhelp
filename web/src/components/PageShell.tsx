import type { ReactNode } from "react";

import { Footer } from "./Footer";
import { NavBar } from "./NavBar";

export function PageShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="page-shell">
      <NavBar />
      <main className="main-feed" id="main-content">
        {children}
      </main>
      <aside className="right-sidebar">
        <div className="card soft stack" style={{ gap: "var(--spacing-md)" }}>
          <h3 style={{ fontSize: "1.1rem" }}>Trending Services</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <span className="pill">Plumbing</span>
            <span className="pill">Electrician</span>
            <span className="pill">Cleaning</span>
            <span className="pill">Elder Care</span>
          </div>
        </div>
        <div className="card soft stack" style={{ gap: "var(--spacing-md)" }}>
          <h3 style={{ fontSize: "1.1rem" }}>Privacy Promise</h3>
          <p className="muted-text" style={{ fontSize: "0.9rem" }}>
            Your data is encrypted. Contacts are only shared after mutual consent.
          </p>
        </div>
        <div>
          <Footer />
        </div>
      </aside>
    </div>
  );
}
