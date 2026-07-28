"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isMfaChallenge } from "@woney/api-client";
import { readOAuthProvider } from "@/components/SsoButtons";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";
import { mfaChallengeHref, storeMfaChallenge } from "@/lib/mfaChallenge";

function loginErrorHref(message: string): string {
  const q = new URLSearchParams();
  q.set("error", message);
  return `/login?${q.toString()}`;
}

function oauthProviderErrorMessage(error: string, description: string | null): string {
  const desc = description?.trim();
  if (desc) return desc;
  switch (error) {
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "invalid_request":
      return "Google rejected the sign-in request. Try again.";
    default:
      return `Google sign-in failed (${error}).`;
  }
}

/** Survives Strict Mode remounts so the one-time auth code is not exchanged twice. */
let oauthCodeInFlight: string | null = null;

function OAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = params.get("error");
    if (oauthError) {
      const message = oauthProviderErrorMessage(oauthError, params.get("error_description"));
      router.replace(loginErrorHref(message));
      return;
    }

    const code = params.get("code");
    if (!code) {
      const message = "Missing authorization code from Google.";
      setError(message);
      router.replace(loginErrorHref(message));
      return;
    }

    if (oauthCodeInFlight === code) return;
    oauthCodeInFlight = code;

    const provider = readOAuthProvider(params.get("state"));
    const redirectUri = `${window.location.origin}/login/oauth/callback`;

    (async () => {
      try {
        const result = await api.loginWithOAuthCode(provider, code, redirectUri);
        if (isMfaChallenge(result)) {
          storeMfaChallenge(result);
          // Pass short-lived challenge JWT in the URL so MFA survives sessionStorage loss.
          router.replace(mfaChallengeHref(result));
          return;
        }
        kickoffBankSync();
        router.replace("/dashboard");
      } catch (err) {
        oauthCodeInFlight = null;
        const message = authErrorMessage(err, "Sign-in failed");
        setError(message);
        router.replace(loginErrorHref(message));
      }
    })();
  }, [params, router]);

  if (error) {
    return (
      <main className="auth">
        <section className="auth-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="auth-card">
            <h1>Sign-in failed</h1>
            <p className="sub">{error}</p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => router.push("/login")}>
              Back to sign in
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <WoneyLoader label="Signing you in" />;
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<WoneyLoader label="Signing you in" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
