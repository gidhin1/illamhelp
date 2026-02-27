"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/session/SessionProvider";
import { Button } from "@/components/ui/primitives";

const links = [
  { href: "/jobs", label: "Jobs" },
  { href: "/connections", label: "People" },
  { href: "/consent", label: "Privacy" },
  { href: "/profile", label: "Profile" }
];

export function NavBar(): JSX.Element {
  const pathname = usePathname();
  const { user, signOut } = useSession();

  return (
    <header className="nav-wrap">
      <div className="container nav">
        <Link href="/" className="brand-mark">
          <span className="brand-dot" />
          IllamHelp
        </Link>
        <nav className="nav-links">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link"
                style={active ? { color: "var(--ink)", background: "rgba(255,255,255,0.72)" } : undefined}
              >
                {link.label}
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
