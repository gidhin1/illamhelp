"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  Home,
  ShieldAlert,
  BadgeCheck,
  FileSearch,
  LogIn,
  LogOut,
  User
} from "lucide-react";

import { useAdminUi } from "@/components/AdminUiProvider";
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
  const { isDesktopSidebarCollapsed, toggleDesktopSidebar } = useAdminUi();
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
    <nav
      aria-label="Admin sidebar"
      className={`sidebar-nav ${isDesktopSidebarCollapsed ? "is-collapsed" : "is-expanded"}`}
      data-collapsed={isDesktopSidebarCollapsed ? "true" : "false"}
      data-testid="admin-sidebar"
    >
      <div className="sidebar-header">
        <Link
          href="/"
          aria-label="Dashboard"
          title="Dashboard"
          className="sidebar-brand"
        >
          <div className="sidebar-brand-mark">A</div>
          <span className="display-title sidebar-label sidebar-brand-title">Ops Center</span>
        </Link>
        <button
          type="button"
          aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isDesktopSidebarCollapsed}
          aria-pressed={isDesktopSidebarCollapsed}
          title={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle"
          data-testid="admin-sidebar-toggle"
          onClick={toggleDesktopSidebar}
        >
          {isDesktopSidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      <div className="sidebar-nav-group">
        {navLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.Icon;
          const dataTestId =
            link.href === "/"
              ? "admin-sidebar-link-dashboard"
              : `admin-sidebar-link-${link.href.slice(1)}`;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-label={link.label}
              title={link.label}
              className={`sidebar-link ${active ? "is-active" : ""}`}
              data-testid={dataTestId}
            >
              <Icon size={26} {...(active ? { fill: "currentColor", strokeWidth: 1.5 } : { strokeWidth: 2 })} />
              <span className="sidebar-label">{link.label}</span>
            </Link>
          );
        })}
      </div>

      {user ? (
        <div className="sidebar-user">
          <div className="sidebar-user-summary" title={user.publicUserId}>
             <User size={36} color="var(--brand)" />
             <div className="sidebar-label sidebar-user-copy">
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
            className="sidebar-signout"
          >
             <LogOut size={18} /> <span className="sidebar-label">Sign Out</span>
          </Button>
        </div>
      ) : (
        <div className="sidebar-user">
          <Link href="/auth/login" className="sidebar-auth-link" aria-label="Sign in" title="Sign in">
            <Button className="sidebar-auth-button" variant="secondary">
              <LogIn size={18} />
              <span className="sidebar-label">Sign in</span>
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );

  return (
    <>
      {desktopSidebar}
      {mobileBottomNav}
    </>
  );
}
