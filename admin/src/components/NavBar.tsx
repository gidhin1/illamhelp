"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ShieldAlert,
  BadgeCheck,
  FileSearch,
  LogOut,
  User
} from "lucide-react";

import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/primitives";

const navLinks = [
  { href: "/", label: "Dashboard", Icon: Home },
  { href: "/moderation", label: "Moderation", Icon: ShieldAlert },
  { href: "/verifications", label: "Verifications", Icon: BadgeCheck },
  { href: "/audit", label: "Consent + Audit", Icon: FileSearch }
];

export function NavBar(): React.JSX.Element {
  const pathname = usePathname();
  const { user, hasAdminAccess, signOut } = useSession();

  const mobileBottomNav = (
    <nav className="bottom-nav">
      {navLinks.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.Icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-label={link.label}
            title={link.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "8px",
              color: active ? "var(--brand)" : "var(--muted)",
              minWidth: "64px"
            }}
          >
            <Icon size={24} {...(active ? { fill: "currentColor" } : {})} />
            <span style={{ fontSize: "10px", fontWeight: active ? 600 : 500 }}>
              {link.label}
            </span>
          </Link>
        );
      })}
      {user && (
        <button
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            padding: "8px",
            color: "var(--muted)",
            minWidth: "64px",
            background: "none",
            border: "none",
            cursor: "pointer"
          }}
        >
          <LogOut size={24} />
          <span style={{ fontSize: "10px", fontWeight: 500 }}>Sign Out</span>
        </button>
      )}
    </nav>
  );

  const desktopSidebar = (
    <nav className="sidebar-nav">
      <Link
        href="/"
        aria-label="Dashboard"
        title="Dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px",
          marginBottom: "var(--spacing-xl)",
          color: "var(--brand)",
          alignSelf: "start"
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "linear-gradient(145deg, var(--brand), var(--brand-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: "18px"
            }}
        >
            A
        </div>
        <span
          className="display-title"
          style={{ fontSize: "1.25rem", color: "var(--ink)", display: "var(--is-mobile, block)" }}
        >
          Ops Center
        </span>
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", flex: 1 }}>
        {navLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.Icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-label={link.label}
              title={link.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                color: active ? "var(--ink)" : "var(--muted)",
                background: active ? "var(--surface-hover)" : "transparent",
                fontWeight: active ? 700 : 500,
                fontSize: "1.1rem",
                transition: "background 0.2s"
              }}
              className="nav-item-hover"
            >
              <Icon size={26} {...(active ? { fill: "currentColor", strokeWidth: 1.5 } : { strokeWidth: 2 })} />
              <span className="sidebar-label" style={{ display: "var(--is-mobile, block)" }}>{link.label}</span>
            </Link>
          );
        })}
      </div>

      {user ? (
        <div style={{ width: "100%", padding: "12px", marginTop: "auto" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
             <User size={36} color="var(--brand)" />
             <div className="sidebar-label" style={{ display: "var(--is-mobile, block)" }}>
                <div style={{ fontWeight: 600 }}>{user.publicUserId}</div>
                <div className="pill" style={{ padding: "2px 6px", fontSize: "0.7rem", marginTop: 4 }}>
                  {hasAdminAccess ? "Admin" : "Member"}
                </div>
             </div>
          </div>
          <Button
            variant="ghost"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
             <LogOut size={18} /> <span className="sidebar-label" style={{ display: "var(--is-mobile, block)" }}>Sign Out</span>
          </Button>
        </div>
      ) : (
        <div style={{ width: "100%", padding: "12px", marginTop: "auto" }}>
          <Link href="/auth/login" style={{ width: "100%" }}>
            <Button style={{ width: "100%" }}>Sign in</Button>
          </Link>
        </div>
      )}

      {/* Adding a style block to hide labels on smaller desktop screens */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1023px) {
          .sidebar-label { display: none !important; }
          .nav-item-hover { justify-content: center; }
        }
        .nav-item-hover:hover { background: var(--surface-2) !important; }
      `}} />
    </nav>
  );

  return (
    <>
      {desktopSidebar}
      {mobileBottomNav}
    </>
  );
}
