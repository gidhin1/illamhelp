"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- OAuth routes require top-level browser navigation. */

import { formatUiError } from "@illamhelp/shared-types";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { useSession } from "@/components/session/SessionProvider";
import { SectionHeader } from "@illamhelp/ui-web/section-header";
import { login } from "@/lib/api";

import styles from "../auth-flow.module.css";
import { FacebookSignInLink } from "../FacebookSignInLink";
import { GoogleSignInLink } from "../GoogleSignInLink";

export default function LoginForm({ hosted, google, facebook, reset, retry }: {
  hosted: boolean;
  google: boolean;
  facebook: boolean;
  reset: boolean;
  retry: boolean;
}): JSX.Element {
  const router = useRouter();
  const { applyAuthSession } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(retry ? "Sign-in didn’t finish. Choose a sign-in option to try again." : null);

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
        <div className={`container ${styles.container}`}>
          <SectionHeader
            title="Sign in"
            subtitle={google || facebook ? "Choose how to sign in to IllamHelp." : "Use your username or email and password."}
          />
          <div className="card stack login-card">
            {error ? <div className="banner error" role="alert">{error}</div> : null}
            {hosted ? (
              <div className="stack">
                <a className={`button ${styles.provider}`} href="/auth/oidc/password">Sign in with password</a>
                {google ? <GoogleSignInLink /> : null}
                {facebook ? <FacebookSignInLink /> : null}
                <div className={styles.actions}>
                  {reset ? <a className={styles.help} href="/auth/oidc/reset">Forgot your password?</a> : null}
                  <Link prefetch={false} className={styles.help} href="/auth/register">Create an account</Link>
                </div>
              </div>
            ) : <form className="stack" onSubmit={onSubmit}>
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
              <div className={styles.actions}>
                <button className="button" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
                <Link prefetch={false} href="/auth/register" className="button ghost">Create account</Link>
              </div>
            </form>}
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
