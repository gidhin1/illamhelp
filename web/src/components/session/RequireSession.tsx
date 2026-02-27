"use client";

import Link from "next/link";

import { Button, Card } from "@/components/ui/primitives";

import { useSession } from "./SessionProvider";

export function RequireSession({
  children
}: {
  children: JSX.Element;
}): JSX.Element {
  const { loading, user, error } = useSession();

  if (loading) {
    return (
      <Card className="stack">
        <h3>Loading session...</h3>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="stack">
        <h3>Please sign in</h3>
        <p className="muted-text">
          Sign in or create an account to continue.
        </p>
        {error ? <p className="field-error">{error}</p> : null}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/auth/login">
            <Button>Sign In</Button>
          </Link>
          <Link href="/auth/register">
            <Button variant="ghost">Register</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return children;
}
