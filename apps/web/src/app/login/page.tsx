"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isMfaChallenge, type OAuthProvider } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { AuthAlert, FadeIn } from "@/components/MotionEnter";
import { SsoButtons } from "@/components/SsoButtons";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";
import { mfaChallengeHref, storeMfaChallenge } from "@/lib/mfaChallenge";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [ssoLoading, setSsoLoading] = useState(true);
  const [ssoNote, setSsoNote] = useState<string | null>(null);

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

  useEffect(() => {
    const fromQuery = params.get("error")?.trim();
    if (!fromQuery) return;
    setError(fromQuery);
    try {
      window.history.replaceState({}, "", "/login");
    } catch {
      /* ignore */
    }
  }, [params]);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        storeMfaChallenge(result);
        router.replace(mfaChallengeHref(result));
      } else {
        kickoffBankSync();
        router.replace("/dashboard");
      }
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
          headline="Money that feels calm."
          lede="Clear categories, live Canadian bank sync, and a planner that never invents the math."
        />
        <section className="auth-panel">
          <FadeIn y={10} className="auth-card">
            <h1>Welcome back</h1>
            <p className="sub">Sign in to your Woney account</p>
            <SsoButtons providers={providers} intent="login" loading={ssoLoading} />
            {ssoNote && !providers.length && !ssoLoading && <p className="muted">{ssoNote}</p>}
            <form onSubmit={submitLogin}>
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
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <AuthAlert message={error} />
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="muted" style={{ marginTop: 16 }}>
              <Link href="/forgot-password">Forgot password?</Link>
              {" · "}
              <Link href="/register">Create account</Link>
            </p>
          </FadeIn>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth" />}>
      <LoginInner />
    </Suspense>
  );
}
