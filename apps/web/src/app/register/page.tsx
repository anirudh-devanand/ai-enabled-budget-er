"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { OAuthProvider } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { SsoButtons } from "@/components/SsoButtons";
import { PasswordStrength } from "@/components/ui";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/errors";
import { passwordScore } from "@/lib/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [ssoNote, setSsoNote] = useState<string | null>(null);
  const strength = useMemo(() => passwordScore(password), [password]);

  useEffect(() => {
    api
      .listOAuthProviders()
      .then((r) => {
        setProviders(r.providers);
        setSsoNote(null);
      })
      .catch(() => {
        setProviders([]);
        setSsoNote("Sign-in providers unavailable — check your connection and try again.");
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (strength.score < 3) {
      setError("Choose a stronger password before continuing.");
      return;
    }
    setBusy(true);
    try {
      await api.register(email, password, displayName);
      await api.login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-shell">
        <AuthBrand
          headline="Start with clarity."
          lede="Your personal household is ready the moment you join — no setup maze."
          footer="Trusted sync. Honest numbers."
        />
        <section className="auth-panel">
          <div className="auth-card">
            <h1>Create your account</h1>
            <p className="sub">Takes about a minute — or continue with SSO.</p>
            <SsoButtons providers={providers} />
            {ssoNote && !providers.length && <p className="muted">{ssoNote}</p>}
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="username"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <PasswordStrength password={password} />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy || strength.score < 3}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>
            {error && <p className="error">{error}</p>}
            <p className="alt">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
