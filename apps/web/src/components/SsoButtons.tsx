"use client";

import type { OAuthProvider } from "@woney/api-client";

const PROVIDER_KEY = "woney_oauth_provider";
const INTENT_KEY = "woney_oauth_intent";
const REDIRECT_KEY = "woney.oauth_redirect_uri";

export type OAuthIntent = "login" | "signup";

function storeOAuthIntent(intent: OAuthIntent) {
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* private mode */
  }
}

function storeOAuthRedirectFromAuthUrl(authUrl: string) {
  try {
    const redirect = new URL(authUrl).searchParams.get("redirect_uri");
    if (redirect) sessionStorage.setItem(REDIRECT_KEY, redirect);
  } catch {
    /* ignore */
  }
}

export function readOAuthIntent(): OAuthIntent {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (raw === "signup" || raw === "login") return raw;
  } catch {
    /* ignore */
  }
  return "login";
}

export function clearOAuthIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l.0.0 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function logoFor(id: string) {
  switch (id) {
    case "google":
      return <GoogleLogo />;
    case "apple":
      return <AppleLogo />;
    case "microsoft":
      return <MicrosoftLogo />;
    default:
      return null;
  }
}

type Props = {
  providers: OAuthProvider[];
  /** signup → existing emails are rejected and sent to login; login → normal SSO. */
  intent?: OAuthIntent;
  /** Show an immediate Google placeholder while /oauth/providers loads. */
  loading?: boolean;
};

export function SsoButtons({ providers, intent = "login", loading = false }: Props) {
  if (loading && !providers.length) {
    return (
      <>
        <div className="sso-row" aria-busy="true" aria-label="Loading sign-in options">
          <button type="button" className="sso-btn sso-btn-skeleton" disabled>
            <span className="sso-icon">{logoFor("google")}</span>
            <span>Continue with Google</span>
          </button>
        </div>
        <div className="sso-divider">or use email</div>
      </>
    );
  }

  if (!providers.length) return null;

  return (
    <>
      <div className="sso-row">
        {providers.map((p) => {
          const ready = Boolean(p.enabled && p.auth_url);
          return (
            <button
              key={p.id}
              type="button"
              className="sso-btn"
              disabled={!ready}
              title={
                ready
                  ? `Continue with ${p.name}`
                  : `${p.name} SSO — add WONEY_*_OAUTH credentials to enable`
              }
              onClick={() => {
                if (!p.auth_url) return;
                try {
                  sessionStorage.setItem(PROVIDER_KEY, p.id);
                } catch {
                  /* private mode */
                }
                storeOAuthIntent(intent);
                storeOAuthRedirectFromAuthUrl(p.auth_url);
                window.location.href = p.auth_url;
              }}
            >
              <span className="sso-icon">{logoFor(p.id)}</span>
              <span>
                Continue with {p.name}
                {!ready ? " (soon)" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="sso-divider">or use email</div>
    </>
  );
}

export function readOAuthProvider(stateParam: string | null): string {
  if (stateParam?.includes(":")) {
    const id = stateParam.split(":")[0]?.toLowerCase();
    if (id === "google" || id === "apple" || id === "microsoft") return id;
  }
  try {
    const stored = sessionStorage.getItem(PROVIDER_KEY);
    if (stored === "google" || stored === "apple" || stored === "microsoft") return stored;
  } catch {
    /* ignore */
  }
  return "google";
}
