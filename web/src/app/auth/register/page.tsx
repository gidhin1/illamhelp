"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const { applyAuthSession } = useSession();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedUserId = username.trim();
      if (normalizedUserId.length < 3) {
        throw new Error("User ID must be at least 3 characters.");
      }
      const session = await register({
        username: normalizedUserId,
        email,
        password,
        firstName,
        lastName: lastName || undefined,
        phone: phone || undefined
      });
      await applyAuthSession(session);
      router.push("/jobs");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to register");
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
            subtitle="Create your IllamHelp account and start posting work or offering services."
          />
          <Card className="stack">
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
              <Field label="User ID" hint="This is your public member ID.">
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
                  placeholder="StrongPass#2026"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
              <div className="stack" style={{ alignContent: "end" }}>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create account"}
                </Button>
                <Link href="/auth/login">
                  <Button variant="ghost" type="button">Already have account</Button>
                </Link>
              </div>
            </form>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
