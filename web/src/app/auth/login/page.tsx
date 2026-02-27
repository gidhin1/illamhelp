"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { Banner, Button, Card, Field, SectionHeader, TextInput } from "@/components/ui/primitives";
import { login } from "@/lib/api";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const { applyAuthSession } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await login({ username, password });
      await applyAuthSession(session);
      router.push("/jobs");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container" style={{ maxWidth: "620px" }}>
          <SectionHeader
            eyebrow="Authentication"
            title="Sign in"
            subtitle="Use username/email and password from your registered account."
          />
          <Card className="stack">
            {error ? <Banner tone="error">{error}</Banner> : null}
            <form className="stack" onSubmit={onSubmit}>
              <Field label="Username or Email">
                <TextInput
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="anita_worker_01"
                  required
                />
              </Field>
              <Field label="Password">
                <TextInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="StrongPass#2026"
                  type="password"
                  required
                />
              </Field>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Link href="/auth/register">
                  <Button variant="ghost" type="button">Create account</Button>
                </Link>
              </div>
            </form>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
