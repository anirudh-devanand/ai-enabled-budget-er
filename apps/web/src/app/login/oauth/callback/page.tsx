"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isMfaChallenge } from "@woney/api-client";
import { readOAuthProvider } from "@/components/SsoButtons";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { kickoffBankSync } from "@/lib/bankSync";
import { authErrorMessage } from "@/lib/errors";

function OAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("Missing authorization code");
      return;
    }
    const provider = readOAuthProvider(params.get("state"));
    const redirectUri = `${window.location.origin}/login/oauth/callback`;
    (async () => {
      try {
        const result = await api.loginWithOAuthCode(provider, code, redirectUri);
        if (isMfaChallenge(result)) {
          router.replace("/login");
          return;
        }
        kickoffBankSync();
        router.replace("/dashboard");
      } catch (err) {
        setError(authErrorMessage(err, "Sign-in failed"));
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
