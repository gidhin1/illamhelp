"use client";

import Link from "next/link";

import { Button, Card } from "@/components/ui/primitives";

import { useSession } from "./SessionProvider";

export function RequireAdminSession({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { loading, user, error, hasAdminAccess, signOut } = useSession();

  if (loading) {
    return (
      <Card className="stack">
        <h3>Loading admin session...</h3>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="stack">
        <h3>Sign in required</h3>
        <p className="muted-text">Please sign in with an admin or support account.</p>
        {error ? <p className="field-error">{error}</p> : null}
        <Link href="/auth/login">
          <Button>Sign in</Button>
        </Link>
      </Card>
    );
  }

  if (!hasAdminAccess) {
    return (
      <Card className="stack">
        <h3>Admin access required</h3>
        <p className="muted-text">
          This account does not have admin or support access. Sign in with a permitted account.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button onClick={signOut}>Sign out</Button>
          <Link href="/auth/login">
            <Button variant="ghost">Sign in with another account</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return children;
}
