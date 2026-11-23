"use client";

import { formatUiError } from "@illamhelp/shared-types";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { SectionHeader } from "@illamhelp/ui-web/section-header";
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
      setError(formatUiError(requestError, "Couldn’t sign in. Try again."));
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
            subtitle="Sign in with your username or email and password."
          />
          <div className="card stack login-card">
            {error ? <div className="banner error" role="alert">{error}</div> : null}
            <form className="stack" onSubmit={onSubmit}>
              <label className="field">
                <span className="field-label">Username or email</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter your username or email"
                  required
                  autoComplete="username"
                />
              </label>
              <label className="field">
                <span className="field-label">Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="button" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
                <Link prefetch={false} href="/auth/register" className="button ghost">Create account</Link>
              </div>
            </form>
          </div>
          <div className="legal-link-row auth-legal-row">
            <Link prefetch={false} href="/privacy-policy">Privacy Policy</Link>
            <Link prefetch={false} href="/terms">Terms</Link>
            <Link prefetch={false} href="/faq">FAQ</Link>
            <Link prefetch={false} href="/help">Help</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
