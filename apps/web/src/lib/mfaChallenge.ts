import type { MfaChallengeResponse } from "@woney/api-client";

export const MFA_CHALLENGE_KEY = "woney.mfa_challenge";

export function storeMfaChallenge(result: MfaChallengeResponse) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(MFA_CHALLENGE_KEY, JSON.stringify(result));
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
  sessionStorage.removeItem(MFA_CHALLENGE_KEY);
}
