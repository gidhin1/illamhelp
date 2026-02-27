import { Footer } from "./Footer";
import { NavBar } from "./NavBar";

export function PageShell({ children }: { children: any }): JSX.Element {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
