"use client";

import { formatUiError } from "@illamhelp/shared-types";
import { CheckboxInput } from "@illamhelp/ui-web";
import { LinkButton } from "@/components/ui/LinkButton";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CURRENT_LEGAL_VERSIONS } from "@illamhelp/shared-types";

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
import { register } from "@/lib/api";
import { trackEvent, utmParams } from "@/lib/analytics";
import { FacebookSignInLink } from "../../../auth/FacebookSignInLink";
import { GoogleSignInLink } from "../../../auth/GoogleSignInLink";

export default function RegisterForm({ google, facebook }: { google: boolean; facebook: boolean }): JSX.Element {
  const router = useRouter();
  const { applyAuthSession } = useSession();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("signup_started", {
      surface: "web",
      source: "register_page",
      ...utmParams()
    });
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedUserId = username.trim();
      if (normalizedUserId.length < 3) {
        throw new Error("Enter a member ID with at least 3 characters.");
      }
      if (!legalAccepted) {
        throw new Error("Accept the current Terms and Privacy Policy to create an account.");
      }
      const session = await register({
        username: normalizedUserId,
        email,
        password,
        firstName,
        lastName: lastName || undefined,
        phone: phone || undefined,
        acceptedTermsVersion: CURRENT_LEGAL_VERSIONS.terms,
        acceptedPrivacyPolicyVersion: CURRENT_LEGAL_VERSIONS.privacyPolicy,
        acceptedLegalAt: new Date().toISOString(),
        acceptanceSource: "web"
      });
      await applyAuthSession(session);
      router.push("/jobs");
    } catch (requestError) {
      setError(formatUiError(requestError, "Couldn’t create your account. Check your details and try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <section className="section">
        <div className="container" style={{ maxWidth: "760px" }}>
          <SectionHeader
            eyebrow="Authentication"
            title="Create account"
            subtitle="Post jobs or offer your services."
          />
          <Card variant="action" className="stack">
            {google ? <GoogleSignInLink /> : null}
            {facebook ? <FacebookSignInLink /> : null}
            {error ? <Banner tone="error">{error}</Banner> : null}
            <form className="grid two" onSubmit={onSubmit}>
              <Field label="First name">
                <TextInput
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Anita"
                  required
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last name">
                <TextInput
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="K"
                  autoComplete="family-name"
                />
              </Field>
              <Field label="Email">
                <TextInput
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="anita@example.com"
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Member ID" hint="Other members can use this ID to find you.">
                <TextInput
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="anita_worker_01"
                  required
                  autoComplete="username"
                />
              </Field>
              <Field label="Phone (optional)">
                <TextInput
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </Field>
              <Field label="Password" hint="Minimum 8 characters">
                <TextInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
              <label className="legal-acceptance-field">
                <CheckboxInput
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  required
                />
                <span>
                  I agree to the current <Link href="/terms" target="_blank" rel="noopener">Terms and Conditions</Link> and <Link href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</Link>.
                </span>
              </label>
              <div className="stack" style={{ alignContent: "end" }}>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create account"}
                </Button>
                <LinkButton href="/auth/login" variant="ghost">Sign in instead</LinkButton>
              </div>
            </form>
          </Card>
          <p className="field-hint">Help and policy links open in a new tab.</p>
          <div className="legal-link-row auth-legal-row">
            <Link href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</Link>
            <Link href="/terms" target="_blank" rel="noopener">Terms</Link>
            <Link href="/faq" target="_blank" rel="noopener">FAQ</Link>
            <Link href="/help" target="_blank" rel="noopener">Help</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
