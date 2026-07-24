"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, isMfaChallenge, type OAuthProvider } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { SsoButtons } from "@/components/SsoButtons";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    api.listOAuthProviders().then((r) => setProviders(r.providers)).catch(() => undefined);
  }, []);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        setChallengeToken(result.challenge_token);
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setBusy(true);
    try {
      await api.verifyMfa(challengeToken, code);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
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
          <div className="auth-card">
            <h1>{challengeToken ? "Confirm it’s you" : "Welcome back"}</h1>
            <p className="sub">
              {challengeToken
                ? "Enter the code from your authenticator app"
                : "Sign in to your Woney account"}
            </p>
            {challengeToken ? (
              <form onSubmit={submitMfa}>
                <div className="field">
                  <label htmlFor="code">Authentication code</label>
                  <input
                    id="code"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? "Verifying…" : "Verify"}
                </button>
              </form>
            ) : (
              <>
                <SsoButtons providers={providers} />
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
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
              </>
            )}
            {error && <p className="error">{error}</p>}
            <p className="alt">
              New here? <Link href="/register">Create an account</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
