"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BOTTOM_BAR_NAV,
  DRAWER_NAV,
  MOBILE_NAVIGATION,
  type AppNavIcon,
  type AppNavItem,
  type ThemePreference
} from "@illamhelp/shared-types";

import { useSession } from "@/components/session/SessionProvider";
import { useThemePreference } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/primitives";
import { getUnreadNotificationCount } from "@/lib/api";

const desktopLinks = [
  MOBILE_NAVIGATION.find((item) => item.key === "home"),
  MOBILE_NAVIGATION.find((item) => item.key === "jobs")?.children?.[0],
  MOBILE_NAVIGATION.find((item) => item.key === "people"),
  MOBILE_NAVIGATION.find((item) => item.key === "privacy"),
  MOBILE_NAVIGATION.find((item) => item.key === "alerts"),
  MOBILE_NAVIGATION.find((item) => item.key === "verify"),
  MOBILE_NAVIGATION.find((item) => item.key === "profile")
].filter(Boolean) as AppNavItem[];

function isActivePath(pathname: string, href?: string): boolean {
  if (!href) return false;
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/jobs/discover") {
    return pathname === "/jobs" || pathname.startsWith("/jobs/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function iconPath(name: AppNavIcon): JSX.Element {
  switch (name) {
    case "home":
      return <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
    case "people":
      return <><path d="M9 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20a5 5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 11a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 17 11Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M15 20a4 4 0 0 1 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></>;
    case "profile":
      return <><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></>;
    case "verify":
      return <><path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="m9.5 12 1.8 1.8L15 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>;
    case "jobs":
      return <><rect x="4" y="7" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 11h16" fill="none" stroke="currentColor" strokeWidth="1.8"/></>;
    case "alerts":
      return <><path d="M8 18h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M6 17h12l-1.2-2.4V10a4.8 4.8 0 1 0-9.6 0v4.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></>;
    case "privacy":
      return <><rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M8.5 11V8.7a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="currentColor" strokeWidth="1.8"/></>;
    case "settings":
      return <><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 4.5v2M12 17.5v2M19.5 12h-2M6.5 12h-2M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4M17.3 17.3l-1.4-1.4M8.1 8.1 6.7 6.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></>;
    case "help":
      return <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M9.8 9.3a2.3 2.3 0 0 1 4.4.9c0 1.6-1.7 2.1-2.2 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="17" r=".9" fill="currentColor"/></>;
    case "menu":
      return <><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></>;
    case "theme":
      return <><path d="M12 3a9 9 0 1 0 9 9A7 7 0 0 1 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></>;
    case "chevronDown":
      return <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
    case "chevronRight":
      return <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
    default:
      return <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />;
  }
}

function NavIcon({ name, className }: { name: AppNavIcon; className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={{ width: 22, height: 22 }}>
      {iconPath(name)}
    </svg>
  );
}

function ThemeButtons(): JSX.Element {
  const { preference, setPreference } = useThemePreference();
  return (
    <div className="mobile-theme-row">
      {(["system", "dark", "light"] as ThemePreference[]).map((mode) => {
        const active = mode === preference;
        return (
          <button
            key={mode}
            type="button"
            className={`mobile-theme-chip ${active ? "active" : ""}`}
            onClick={() => setPreference(mode)}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

export function NavBar(): JSX.Element {
  const pathname = usePathname();
  const { user, accessToken, signOut } = useSession();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    setJobsExpanded(pathname.startsWith("/jobs"));
  }, [pathname]);

  useEffect(() => {
    if (!user || !accessToken) {
      return;
    }

    let cancelled = false;
    const refreshUnread = async (): Promise<void> => {
      try {
        const response = await getUnreadNotificationCount(accessToken);
        if (!cancelled) {
          setUnreadAlerts(response.unreadCount);
        }
      } catch {
        if (!cancelled) {
          setUnreadAlerts(0);
        }
      }
    };
    void refreshUnread();
    return () => {
      cancelled = true;
    };
  }, [accessToken, pathname, user]);

  const currentTitle = useMemo(() => {
    if (!isAuthenticated) {
      return "IllamHelp";
    }

    const match = [...MOBILE_NAVIGATION, ...DRAWER_NAV.flatMap((item) => item.children ?? [])].find((item) => isActivePath(pathname, item.webHref));
    return match?.mobileTitle ?? "IllamHelp";
  }, [isAuthenticated, pathname]);

  return (
    <>
      <header className="mobile-shell-header">
        <button
          type="button"
          className="mobile-shell-icon-button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label={isAuthenticated ? "Open navigation" : "Open guest menu"}
          data-testid="mobile-drawer-toggle"
        >
          <NavIcon name="menu" />
        </button>
        <div className="mobile-shell-header-copy">
          <span className="mobile-shell-title">{currentTitle}</span>
          <span className="mobile-shell-subtitle">IllamHelp</span>
        </div>
        {user ? (
          <Link href="/profile" className="mobile-shell-avatar" aria-label="Open profile">
            {user.publicUserId.slice(0, 1).toUpperCase()}
          </Link>
        ) : (
          <Link href="/auth/login" className="mobile-shell-icon-button" aria-label="Sign in">
            <NavIcon name="profile" />
          </Link>
        )}
      </header>

      <aside className="sidebar-nav">
        <Link href="/" className="sidebar-brand">
          <span style={{ fontSize: "2rem" }}>✨</span>
          <span className="nav-label" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--brand)", display: "none" }}>
            IllamHelp
          </span>
        </Link>
        {isAuthenticated ? (
          <nav className="sidebar-menu">
            {desktopLinks.map((link) => {
              const active = isActivePath(pathname, link.webHref);
              return (
                <Link key={link.key} href={link.webHref ?? "/"} className={`sidebar-link ${active ? "active" : ""}`}>
                  <span style={{ position: "relative", display: "inline-flex" }}>
                    <NavIcon name={link.icon} />
                    {link.key === "alerts" && unreadAlerts > 0 ? (
                      <span className="badge" data-testid="nav-notifications-unread-badge" style={{ position: "absolute", top: -8, right: -12 }}>
                        {Math.min(unreadAlerts, 99)}
                      </span>
                    ) : null}
                  </span>
                  <span className="nav-label" style={{ fontSize: "1.2rem", display: "none" }}>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="card soft sidebar-user-chip">{user.publicUserId}</div>
              <Button variant="ghost" onClick={signOut} style={{ width: "100%" }}>
                Sign out
              </Button>
            </>
          ) : (
            <div className="sidebar-footer-actions">
              <Link href="/auth/login" className="button-link block">
                <Button variant="ghost" style={{ width: "100%" }}>Log in</Button>
              </Link>
              <Link href="/auth/register" className="button-link block">
                <Button style={{ width: "100%" }}>Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {isAuthenticated ? (
        <nav className="bottom-nav mobile-bottom-nav">
          {BOTTOM_BAR_NAV.map((link) => {
            const active = isActivePath(pathname, link.webHref);
            return (
              <Link
                key={link.key}
                href={link.webHref ?? "/"}
                className={`mobile-bottom-link ${active ? "active" : ""}`}
                aria-label={link.label}
                data-testid={`tab-${link.key}`}
              >
                <NavIcon name={link.icon} />
              </Link>
            );
          })}
        </nav>
      ) : null}

      {mobileDrawerOpen ? (
        <div className="mobile-drawer-layer" data-testid="mobile-drawer-layer">
          <button
            type="button"
            className="mobile-drawer-scrim"
            aria-label="Close navigation"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="mobile-drawer-panel">
            <div className="mobile-drawer-profile card soft">
              <div className="mobile-drawer-avatar">{user ? user.publicUserId.slice(0, 1).toUpperCase() : "?"}</div>
              <div>
                <div className="mobile-drawer-brand">IllamHelp</div>
                <div className="mobile-drawer-handle">{user ? `@${user.publicUserId}` : "Guest"}</div>
              </div>
            </div>

            <div className="mobile-drawer-section">
              <div className="mobile-drawer-section-title">Appearance</div>
              <ThemeButtons />
            </div>

            {isAuthenticated ? (
              <div className="mobile-drawer-section">
                <div className="mobile-drawer-section-title">Explore</div>
                {DRAWER_NAV.map((item) => {
                  if (item.key === "jobs") {
                    const active = pathname.startsWith("/jobs");
                    return (
                      <div key={item.key} className="mobile-drawer-group">
                        <button
                          type="button"
                          className={`mobile-drawer-link ${active ? "active" : ""}`}
                          onClick={() => setJobsExpanded((open) => !open)}
                          data-testid="drawer-nav-jobs-toggle"
                        >
                          <span className="mobile-drawer-link-icon"><NavIcon name={item.icon} /></span>
                          <span>{item.label}</span>
                          <span className="mobile-drawer-link-chevron">
                            <NavIcon name={jobsExpanded ? "chevronDown" : "chevronRight"} />
                          </span>
                        </button>
                        {jobsExpanded ? (
                          <div className="mobile-drawer-children">
                            {item.children?.map((child) => {
                              const childActive = isActivePath(pathname, child.webHref);
                              return (
                                <Link
                                  key={child.key}
                                  href={child.webHref ?? "/jobs/discover"}
                                  className={`mobile-drawer-child ${childActive ? "active" : ""}`}
                                  data-testid={`drawer-nav-${child.key}`}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  const active = isActivePath(pathname, item.webHref);
                  return (
                    <Link
                      key={item.key}
                      href={item.webHref ?? "/"}
                      className={`mobile-drawer-link ${active ? "active" : ""}`}
                      data-testid={`drawer-nav-${item.key}`}
                    >
                      <span className="mobile-drawer-link-icon" style={{ position: "relative" }}>
                        <NavIcon name={item.icon} />
                        {item.key === "alerts" && unreadAlerts > 0 ? (
                          <span className="badge" style={{ position: "absolute", top: -6, right: -10 }}>
                            {Math.min(unreadAlerts, 99)}
                          </span>
                        ) : null}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {user ? (
              <button type="button" className="mobile-drawer-signout" onClick={signOut} data-testid="drawer-signout">
                Sign out
              </button>
            ) : (
              <div className="mobile-drawer-auth-actions">
                <Link href="/auth/login" className="button secondary">Log in</Link>
                <Link href="/auth/register" className="button">Sign up</Link>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 1024px) {
          .nav-label { display: block !important; }
        }
      `}} />
    </>
  );
}
