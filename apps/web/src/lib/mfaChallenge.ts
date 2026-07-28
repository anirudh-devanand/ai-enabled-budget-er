import type { MfaChallengeResponse } from "@woney/api-client";

export const MFA_CHALLENGE_KEY = "woney.mfa_challenge";

/** Query keys for durable OAuth → MFA handoff (sessionStorage alone is unreliable). */
export const MFA_QUERY_CHALLENGE = "challenge";
export const MFA_QUERY_METHOD = "method";
export const MFA_QUERY_TOTP = "totp";

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
