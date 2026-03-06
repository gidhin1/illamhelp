"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/primitives";
import { getUnreadNotificationCount } from "@/lib/api";

const links = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Jobs" },
  { href: "/connections", label: "People" },
  { href: "/consent", label: "Privacy" },
  { href: "/notifications", label: "Alerts" },
  { href: "/verification", label: "Verify" },
  { href: "/profile", label: "Profile" }
];

export function NavBar(): JSX.Element {
  const pathname = usePathname();
  const { user, accessToken, signOut } = useSession();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

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

  return (
    <header className="nav-wrap">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="container nav">
        <Link href="/" className="brand-mark">
          <span className="brand-dot" />
          IllamHelp
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link"
                style={active ? { color: "var(--ink)", background: "rgba(255,255,255,0.72)" } : undefined}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {link.label}
                  {link.href === "/notifications" && user && unreadAlerts > 0 ? (
                    <span
                      className="pill"
                      data-testid="nav-notifications-unread-badge"
                      style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                    >
                      {Math.min(unreadAlerts, 99)}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
          {user ? (
            <>
              <span className="pill" style={{ padding: "6px 10px" }}>
                Member
              </span>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Register</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
