"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.requestPasswordReset(email);
      setSent(true);
      setDevResetUrl(result.dev_reset_url ?? null);
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
          headline="We’ll get you back in."
          lede="Enter the email on your account and we’ll send a reset link when we can."
        />
        <section className="auth-panel">
          <div className="auth-card">
            <h1>{sent ? "Check your email" : "Forgot password?"}</h1>
            <p className="sub">
              {sent
                ? "If an account exists for that address, you’ll get a link to choose a new password. It expires in about an hour."
                : "We’ll email you a secure link to reset your password."}
            </p>
            {sent ? (
              <>
                {devResetUrl && (
                  <p className="muted" style={{ marginBottom: "1rem" }}>
                    Dev mode (email not configured):{" "}
                    <a href={devResetUrl}>Open reset link</a>
                  </p>
                )}
                <Link className="btn btn-primary btn-block" href="/login">
                  Back to sign in
                </Link>
              </>
            ) : (
              <form onSubmit={submit}>
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
                    autoFocus
                  />
                </div>
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
            {error && <p className="error">{error}</p>}
            <p className="alt">
              <Link href="/login">Back to sign in</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
