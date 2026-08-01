"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { MfaChallengeResponse } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { AuthAlert, FadeIn } from "@/components/MotionEnter";
import { OtpInput } from "@/components/OtpInput";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";
import {
  clearMfaChallenge,
  resolveMfaChallenge,
  storeMfaChallenge,
} from "@/lib/mfaChallenge";

const OTP_LENGTH = 6;

function MfaInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [challenge, setChallenge] = useState<MfaChallengeResponse | null>(null);
  const [useAuthenticator, setUseAuthenticator] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const submittingRef = useRef(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    // Resolve once per mount from URL (durable) and/or sessionStorage.
    // Keep `?challenge=` in the URL until verify succeeds — stripping early
    // breaks private mode / Strict Mode remounts when storage is unavailable.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const fromWindow =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : params;
    const parsed = resolveMfaChallenge(fromWindow) ?? resolveMfaChallenge(params);
    if (!parsed) {
      router.replace("/login");
      return;
    }
    storeMfaChallenge(parsed);
    setChallenge(parsed);
    setUseAuthenticator(parsed.primary_method === "totp");
    setReady(true);
  }, [params, router]);

  function applyChallenge(result: MfaChallengeResponse) {
    storeMfaChallenge(result);
    setChallenge(result);
    setUseAuthenticator(result.primary_method === "totp");
    setUseRecovery(false);
    setCode("");
  }

  const verify = useCallback(
    async (rawCode: string) => {
      if (!challenge || submittingRef.current) return;
      const trimmed = rawCode.trim();
      if (!trimmed) return;
      submittingRef.current = true;
      setError(null);
      setBusy(true);
      try {
        await api.verifyMfa(challenge.challenge_token, trimmed);
        clearMfaChallenge();
        kickoffBankSync();
        router.replace("/dashboard");
      } catch (err) {
        setError(authErrorMessage(err, "Could not verify code."));
        setCode("");
        submittingRef.current = false;
        setBusy(false);
      }
    },
    [challenge, router],
  );

  const onOtpComplete = useCallback(
    (full: string) => {
      void verify(full);
    },
    [verify],
  );

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    await verify(code);
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
      submittingRef.current = false;
    }
  }

  if (!ready || !challenge) {
    return <main className="auth" />;
  }

  const showingEmail =
    !useAuthenticator &&
    !useRecovery &&
    (challenge.primary_method === "email" ||
      challenge.primary_method === "inline" ||
      !challenge.primary_method);

  const showingTotp = useAuthenticator && !useRecovery;

  let subtitle = "Enter your recovery code";
  if (showingEmail) {
    subtitle = challenge.message || "Enter the code we emailed you";
  } else if (showingTotp) {
    subtitle = "Enter the code from your authenticator app";
  }

  return (
    <main className="auth">
      <div className="auth-shell">
        <AuthBrand
          headline="One more step."
          lede="A short code confirms it’s really you before we open your household."
        />
        <section className="auth-panel">
          <FadeIn y={10} className="auth-card">
            <h1>Confirm it’s you</h1>
            <p className="sub">{subtitle}</p>

            {showingEmail && challenge.dev_code && (
              <p className="muted" style={{ marginTop: 0 }}>
                Dev code: <span className="mono">{challenge.dev_code}</span>
              </p>
            )}

            {useRecovery ? (
              <form onSubmit={submitRecovery}>
                <div className="field">
                  <label htmlFor="recovery-code">Recovery code</label>
                  <input
                    id="recovery-code"
                    name="one-time-code"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ABCD-EF01"
                    required
                    autoFocus
                    disabled={busy}
                  />
                </div>
                <AuthAlert message={error} />
                <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
                  {busy ? "Verifying…" : "Verify"}
                </button>
              </form>
            ) : (
              <div>
                <div className="field">
                  <label htmlFor="otp-0">
                    {showingEmail ? "Email code" : "Authenticator code"}
                  </label>
                  <OtpInput
                    id="otp-0"
                    length={OTP_LENGTH}
                    value={code}
                    onChange={setCode}
                    onComplete={onOtpComplete}
                    disabled={busy}
                    autoFocus
                    errorKey={error}
                    aria-label={showingEmail ? "Email verification code" : "Authenticator code"}
                  />
                </div>
                <AuthAlert message={error} />
                {busy && (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Verifying…
                  </p>
                )}
              </div>
            )}

            {showingEmail && (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={busy}
                onClick={resendEmailCode}
                style={{ marginTop: 12 }}
              >
                Resend email code
              </button>
            )}

            {challenge.totp_available && !useRecovery && (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={busy}
                onClick={() => {
                  setUseAuthenticator(!useAuthenticator);
                  setCode("");
                  setError(null);
                  submittingRef.current = false;
                }}
                style={{ marginTop: 8 }}
              >
                {useAuthenticator ? "Use email code instead" : "Use authenticator app instead"}
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode("");
                setError(null);
                submittingRef.current = false;
              }}
              style={{ marginTop: 8 }}
            >
              {useRecovery ? "Use 6-digit code instead" : "Use recovery code"}
            </button>

            <p className="muted" style={{ marginTop: 16 }}>
              <Link
                href="/login"
                onClick={() => {
                  clearMfaChallenge();
                }}
              >
                Back to sign in
              </Link>
            </p>
          </FadeIn>
        </section>
      </div>
    </main>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={<main className="auth" />}>
      <MfaInner />
    </Suspense>
  );
}
