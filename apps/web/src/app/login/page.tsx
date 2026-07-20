"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, isMfaChallenge } from "@ledger/api-client";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <div className="card">
        <h1>Ledger</h1>
        <p className="sub">
          {challengeToken ? "Enter the code from your authenticator app" : "Sign in to continue"}
        </p>
        {challengeToken ? (
          <form onSubmit={submitMfa}>
            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>
              Verify
            </button>
          </form>
        ) : (
          <form onSubmit={submitLogin}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>
              Sign in
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        <p className="alt">
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
