"use client";

import { LinkButton } from "@/components/ui/LinkButton";

import { Card } from "@/components/ui/primitives";

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
        <h2>Checking sign-in…</h2>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="stack">
        <h2>Sign in to continue</h2>
        <p className="muted-text">
          Sign in or create an account to continue.
        </p>
        {error ? <p className="field-error">{error}</p> : null}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <LinkButton href="/auth/login">Sign in</LinkButton>
          <LinkButton href="/auth/register" variant="ghost">Create account</LinkButton>
        </div>
      </Card>
    );
  }

  return children;
}
