"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isMfaChallenge, type MfaChallengeResponse, type OAuthProvider } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { SsoButtons } from "@/components/SsoButtons";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";
import { clearMfaChallenge, readMfaChallenge, storeMfaChallenge } from "@/lib/mfaChallenge";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<MfaChallengeResponse | null>(null);
  const [useAuthenticator, setUseAuthenticator] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
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
      });
  }, []);

  useEffect(() => {
    if (params.get("mfa") !== "1") return;
    const parsed = readMfaChallenge();
    if (parsed) {
      setChallenge(parsed);
      setUseAuthenticator(parsed.primary_method === "totp");
    }
  }, [params]);

  function applyChallenge(result: MfaChallengeResponse) {
    storeMfaChallenge(result);
    setChallenge(result);
    setUseAuthenticator(result.primary_method === "totp");
    setCode("");
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        applyChallenge(result);
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

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      await api.verifyMfa(challenge.challenge_token, code);
      clearMfaChallenge();
      kickoffBankSync();
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Could not verify code."));
    } finally {
      setBusy(false);
    }
  }

  async function resendEmailCode() {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.resendMfa(challenge.challenge_token);
      applyChallenge(next);
    } catch (err) {
      setError(authErrorMessage(err, "Could not resend code."));
    } finally {
      setBusy(false);
    }
  }

  const showingEmail =
    challenge &&
    !useAuthenticator &&
    (challenge.primary_method === "email" ||
      challenge.primary_method === "inline" ||
      !challenge.primary_method);

  return (
    <main className="auth">
      <div className="auth-shell">
        <AuthBrand
          headline="Money that feels calm."
          lede="Clear categories, live Canadian bank sync, and a planner that never invents the math."
        />
        <section className="auth-panel">
          <div className="auth-card">
            <h1>{challenge ? "Confirm it’s you" : "Welcome back"}</h1>
            <p className="sub">
              {challenge
                ? showingEmail
                  ? challenge.message || "Enter the code we emailed you"
                  : "Enter the code from your authenticator app"
                : "Sign in to your Woney account"}
            </p>
            {challenge ? (
              <form onSubmit={submitMfa}>
                {showingEmail && challenge.dev_code && (
                  <p className="muted" style={{ marginTop: 0 }}>
                    Dev code: <span className="mono">{challenge.dev_code}</span>
                  </p>
                )}
                <div className="field">
                  <label htmlFor="code">
                    {showingEmail ? "Email code" : "Authenticator code"}
                  </label>
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
                {error && <div className="error">{error}</div>}
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? "Verifying…" : "Verify"}
                </button>
                {showingEmail && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-block"
                    disabled={busy}
                    onClick={resendEmailCode}
                    style={{ marginTop: 8 }}
                  >
                    Resend email code
                  </button>
                )}
                {challenge.totp_available && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-block"
                    disabled={busy}
                    onClick={() => {
                      setUseAuthenticator(!useAuthenticator);
                      setCode("");
                      setError(null);
                    }}
                    style={{ marginTop: 8 }}
                  >
                    {useAuthenticator
                      ? "Use email code instead"
                      : "Use authenticator app instead"}
                  </button>
                )}
              </form>
            ) : (
              <>
                <SsoButtons providers={providers} />
                {ssoNote && !providers.length && <p className="muted">{ssoNote}</p>}
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
                  {error && <div className="error">{error}</div>}
                  <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
                <p className="muted" style={{ marginTop: 16 }}>
                  <Link href="/forgot-password">Forgot password?</Link>
                  {" · "}
                  <Link href="/register">Create account</Link>
                </p>
              </>
            )}
          </div>
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
