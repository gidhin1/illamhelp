"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import {
  Banner,
  Button,
  Card,
  Field,
  SectionHeader,
  TextInput
} from "@/components/ui/primitives";
import { login } from "@/lib/api";

export default function AdminLoginPage(): React.JSX.Element {
  const router = useRouter();
  const { applyAuthSession, hasAdminAccess, loading, user } = useSession();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && hasAdminAccess) {
      router.replace("/");
    }
  }, [hasAdminAccess, loading, router, user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await login({ username, password });
      await applyAuthSession(session);
      router.replace("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="section">
        <div className="container" style={{ maxWidth: "640px" }}>
          <SectionHeader
            eyebrow="Admin"
            title="Sign in"
            subtitle="Use an admin or support account to access moderation and privacy oversight tools."
          />
          <Card className="stack">
            <form onSubmit={onSubmit} className="stack">
              <Field label="Username or email">
                <TextInput
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
              <Field label="Password">
                <TextInput
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            {error ? <Banner tone="error">{error}</Banner> : null}
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
