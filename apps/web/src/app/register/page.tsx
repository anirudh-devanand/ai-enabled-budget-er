"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isMfaChallenge, type OAuthProvider } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { AuthAlert, FadeIn } from "@/components/MotionEnter";
import { SsoButtons } from "@/components/SsoButtons";
import { PasswordStrength } from "@/components/ui";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage, getApiStatus } from "@/lib/errors";
import { mfaChallengeHref, storeMfaChallenge } from "@/lib/mfaChallenge";
import { passwordScore } from "@/lib/ui";

function loginAccountExistsHref(message: string): string {
  const q = new URLSearchParams();
  q.set("error", message);
  return `/login?${q.toString()}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [ssoLoading, setSsoLoading] = useState(true);
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
      })
      .finally(() => setSsoLoading(false));
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
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        storeMfaChallenge(result);
        router.replace(mfaChallengeHref(result));
        return;
      }
      kickoffBankSync();
      router.replace("/dashboard");
    } catch (err) {
      const message = authErrorMessage(err);
      if (getApiStatus(err) === 409) {
        router.replace(loginAccountExistsHref(message));
        return;
      }
      setError(message);
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
          <FadeIn y={10} className="auth-card">
            <h1>Create your account</h1>
            <p className="sub">Takes about a minute — or continue with SSO.</p>
            <SsoButtons providers={providers} intent="signup" loading={ssoLoading} />
            {ssoNote && !providers.length && !ssoLoading && <p className="muted">{ssoNote}</p>}
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
            <AuthAlert message={error} />
            <p className="alt">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </FadeIn>
        </section>
      </div>
    </main>
  );
}
