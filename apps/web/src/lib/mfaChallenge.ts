import type { MfaChallengeResponse } from "@woney/api-client";

export const MFA_CHALLENGE_KEY = "woney.mfa_challenge";

/** Query keys for durable OAuth → MFA handoff (sessionStorage alone is unreliable). */
export const MFA_QUERY_CHALLENGE = "challenge";
export const MFA_QUERY_METHOD = "method";
export const MFA_QUERY_TOTP = "totp";

/** Matches backend `mfa_challenge_minutes` default (5). */
export const MFA_CHALLENGE_TTL_FALLBACK_SECONDS = 300;

export const MFA_TIMEOUT_MESSAGE =
  "Verification timed out. Sign in again to get a new code.";

export function storeMfaChallenge(result: MfaChallengeResponse) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MFA_CHALLENGE_KEY, JSON.stringify(result));
  } catch {
    /* private mode / quota — URL handoff still works */
  }
}

export function readMfaChallenge(): MfaChallengeResponse | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MFA_CHALLENGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MfaChallengeResponse;
    return parsed?.challenge_token ? parsed : null;
  } catch {
    return null;
  }
}

export function clearMfaChallenge() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(MFA_CHALLENGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Build `/login/mfa?...` with short-lived challenge JWT (and light UX hints). */
export function mfaChallengeHref(result: MfaChallengeResponse): string {
  const q = new URLSearchParams();
  q.set(MFA_QUERY_CHALLENGE, result.challenge_token);
  if (result.primary_method) q.set(MFA_QUERY_METHOD, result.primary_method);
  if (result.totp_available) q.set(MFA_QUERY_TOTP, "1");
  return `/login/mfa?${q.toString()}`;
}

export function loginWithMfaTimeoutHref(message = MFA_TIMEOUT_MESSAGE): string {
  return `/login?error=${encodeURIComponent(message)}`;
}

/** Read JWT `exp` (ms) without verifying — UX timer only; server still validates. */
export function mfaChallengeExpiresAtMs(challengeToken: string): number | null {
  try {
    const parts = challengeToken.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Absolute expiry for the MFA page timer.
 * Prefer JWT exp (works for URL-only handoff); else expires_in_seconds from now.
 */
export function resolveMfaExpiresAtMs(
  challenge: Pick<MfaChallengeResponse, "challenge_token" | "expires_in_seconds">,
  nowMs = Date.now(),
): number {
  const fromJwt = mfaChallengeExpiresAtMs(challenge.challenge_token);
  if (fromJwt != null) return fromJwt;
  const ttl =
    typeof challenge.expires_in_seconds === "number" && challenge.expires_in_seconds > 0
      ? challenge.expires_in_seconds
      : MFA_CHALLENGE_TTL_FALLBACK_SECONDS;
  return nowMs + ttl * 1000;
}

export function isMfaChallengeExpiredError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("timed out") ||
    lower.includes("expired challenge") ||
    (lower.includes("expired") && lower.includes("sign in again"))
  );
}

function methodFromParam(raw: string | null): MfaChallengeResponse["primary_method"] {
  if (raw === "email" || raw === "totp" || raw === "inline") return raw;
  return "email";
}

/** Prefer sessionStorage (full payload, may include dev_code); fall back to URL token. */
export function resolveMfaChallenge(
  params: Pick<URLSearchParams, "get"> | null | undefined,
): MfaChallengeResponse | null {
  const token = params?.get(MFA_QUERY_CHALLENGE)?.trim() || null;
  const stored = readMfaChallenge();

  if (stored?.challenge_token) {
    if (!token || stored.challenge_token === token) {
      return stored;
    }
  }

  if (!token) return null;

  return {
    mfa_required: true,
    challenge_token: token,
    primary_method: methodFromParam(params?.get(MFA_QUERY_METHOD) ?? null),
    totp_available: params?.get(MFA_QUERY_TOTP) === "1",
    message: "Enter the verification code to finish signing in.",
  };
}
