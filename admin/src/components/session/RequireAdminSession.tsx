"use client";

import { LinkButton } from "@/components/ui/LinkButton";

import { Button, Card } from "@/components/ui/primitives";

import { useSession } from "./SessionProvider";

export function RequireAdminSession({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { loading, user, error, hasAdminAccess, signOut } = useSession();

  if (loading) {
    return (
      <Card className="stack" style={{ margin: "var(--spacing-xl)" }}>
        <h1>Checking staff access…</h1>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="stack" style={{ margin: "var(--spacing-xl)" }}>
        <h1>Sign in required</h1>
        <p className="muted-text">Sign in with an admin or support account to continue.</p>
        {error ? <p className="field-error">{error}</p> : null}
        <LinkButton href="/auth/login">Sign in</LinkButton>
      </Card>
    );
  }

  if (!hasAdminAccess) {
    return (
      <Card className="stack" style={{ margin: "var(--spacing-xl)" }}>
        <h1>Admin access required</h1>
        <p className="muted-text">
          Use an admin or support account to open this page.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button onClick={signOut}>Sign out</Button>
          <LinkButton href="/auth/login" variant="ghost">Sign in with another account</LinkButton>
        </div>
      </Card>
    );
  }

  return children;
}
