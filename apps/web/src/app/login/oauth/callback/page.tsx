"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isMfaChallenge } from "@woney/api-client";
import { AuthBrand } from "@/components/AuthBrand";
import { FadeIn } from "@/components/MotionEnter";
import { clearOAuthIntent, readOAuthIntent, readOAuthProvider } from "@/components/SsoButtons";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";
import { mfaChallengeHref, storeMfaChallenge } from "@/lib/mfaChallenge";

/** Bump when changing OAuth callback behavior — confirms Vercel shipped this build. */
const OAUTH_CALLBACK_BUILD = "2026-07-29-mfa-handoff-v2";

const OAUTH_CODE_KEY = "woney.oauth_code_used";
const OAUTH_REDIRECT_KEY = "woney.oauth_redirect_uri";

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

function readStoredRedirectUri(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_REDIRECT_KEY);
  } catch {
    return null;
  }
}

function codeAlreadyUsed(code: string): boolean {
  try {
    return sessionStorage.getItem(OAUTH_CODE_KEY) === code;
  } catch {
    return false;
  }
}

function markCodeUsed(code: string) {
  try {
    sessionStorage.setItem(OAUTH_CODE_KEY, code);
  } catch {
    /* ignore */
  }
}

function clearOAuthHandoff() {
  try {
    sessionStorage.removeItem(OAUTH_CODE_KEY);
    sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
  clearOAuthIntent();
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
      setError(message);
      return;
    }

    const code = params.get("code");
    if (!code) {
      setError("Missing authorization code from Google.");
      return;
    }

    if (oauthCodeInFlight === code) return;
    if (codeAlreadyUsed(code)) {
      setError("This Google sign-in was already used. Go back and try Continue with Google again.");
      return;
    }
    oauthCodeInFlight = code;
    markCodeUsed(code);

    const provider = readOAuthProvider(params.get("state"));
    const state = params.get("state");
    const redirectUri =
      readStoredRedirectUri() || `${window.location.origin}/login/oauth/callback`;
    const intent = readOAuthIntent();

    (async () => {
      try {
        const result = await api.loginWithOAuthCode(
          provider,
          code,
          redirectUri,
          intent,
          state,
        );
        clearOAuthHandoff();
        if (isMfaChallenge(result)) {
          storeMfaChallenge(result);
          // Hard navigation keeps challenge query intact across remounts.
          window.location.assign(mfaChallengeHref(result));
          return;
        }
        kickoffBankSync();
        window.location.assign("/dashboard");
      } catch (err) {
        oauthCodeInFlight = null;
        try {
          sessionStorage.removeItem(OAUTH_CODE_KEY);
        } catch {
          /* ignore */
        }
        clearOAuthIntent();
        setError(authErrorMessage(err, "Sign-in failed"));
      }
    })();
  }, [params, router]);

  if (error) {
    return (
      <main className="auth">
        <div className="auth-shell">
          <AuthBrand
            headline="Sign-in paused."
            lede="Something went wrong finishing Google sign-in. You can go back and try again."
          />
          <section className="auth-panel">
            <FadeIn y={10} className="auth-card">
              <h1>Sign-in failed</h1>
              <p className="sub auth-error-detail">{error}</p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => router.push("/login")}
              >
                Back to sign in
              </button>
            </FadeIn>
          </section>
        </div>
      </main>
    );
  }

  return <WoneyLoader label={`Signing you in (${OAUTH_CALLBACK_BUILD})`} />;
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<WoneyLoader label="Signing you in" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
