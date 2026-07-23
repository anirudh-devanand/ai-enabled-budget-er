"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, isMfaChallenge } from "@ledger/api-client";
import { api } from "@/lib/api";

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
    const redirectUri = `${window.location.origin}/login/oauth/callback`;
    (async () => {
      try {
        const result = await api.loginWithGoogleCode(code, redirectUri);
        if (isMfaChallenge(result)) {
          router.replace("/login");
          return;
        }
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Sign-in failed");
      }
    })();
  }, [params, router]);

  return (
    <main className="auth">
      <section className="auth-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="auth-card">
          <h1>Signing you in…</h1>
          <p className="sub">{error || "Finishing secure sign-in with your provider."}</p>
          {error && (
            <button type="button" className="btn btn-primary btn-block" onClick={() => router.push("/login")}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackInner />
    </Suspense>
  );
}
