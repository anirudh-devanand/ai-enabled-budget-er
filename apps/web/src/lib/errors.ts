import { ApiError, getApiDetailObject } from "@woney/api-client";

export type BankReauthTarget = {
  connectionId: string;
  householdId: string;
  institutionName: string | null;
  code: string;
};

/** Default copy when nothing safe/mapped is available. Never surface raw backend text. */
export const USER_ERROR_FALLBACK = "Something went wrong. Please try again.";

const MAX_USER_MESSAGE_LEN = 180;

/** Structured `detail.code` / known API codes → friendly copy. */
const CODE_MESSAGES: Record<string, string> = {
  ITEM_LOGIN_REQUIRED: "Your bank needs you to sign in again to continue syncing.",
  REAUTH_REQUIRED: "Your bank needs you to sign in again to continue syncing.",
  reauth_required: "Your bank needs you to sign in again to continue syncing.",
  mfa_required: "Turn on email MFA in Account before syncing banks.",
  MFA_REQUIRED: "Turn on email MFA in Account before syncing banks.",
  MFA_CHALLENGE_EXPIRED: "Verification timed out. Sign in again to get a new code.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  RATE_LIMITED: "Too many attempts. Try again in a few minutes.",
};

/**
 * Raw detail extractor for internal matching (codes, reauth deep-links).
 * Do not show this string to end users — use `userFacingError` instead.
 */
export function getApiDetail(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) return err.detail || fallback;
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  if (err instanceof TypeError) {
    return "Network error — check your connection or API URL, then try again.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function isUnauthorized(err: unknown): boolean {
  return getApiStatus(err) === 401;
}

/** Detect Plaid ITEM_LOGIN_REQUIRED (and parse reconnect deep-link fields). */
export function parseItemLoginRequired(err: unknown): BankReauthTarget | null {
  const obj = getApiDetailObject(err);
  if (obj) {
    const code = typeof obj.code === "string" ? obj.code : "";
    if (code === "ITEM_LOGIN_REQUIRED") {
      const connectionId = typeof obj.connection_id === "string" ? obj.connection_id : "";
      const householdId = typeof obj.household_id === "string" ? obj.household_id : "";
      if (connectionId && householdId) {
        return {
          connectionId,
          householdId,
          institutionName:
            typeof obj.institution_name === "string" ? obj.institution_name : null,
          code,
        };
      }
    }
  }

  const detail = getApiDetail(err, "");
  if (!/ITEM_LOGIN_REQUIRED/i.test(detail)) return null;

  const match = detail.match(
    /\/connect\?household=([0-9a-f-]{36})&reconnect=([0-9a-f-]{36})/i,
  );
  if (match) {
    return {
      householdId: match[1],
      connectionId: match[2],
      institutionName: null,
      code: "ITEM_LOGIN_REQUIRED",
    };
  }
  return null;
}

export function reconnectPath(target: BankReauthTarget): string {
  return `/connect?household=${encodeURIComponent(target.householdId)}&reconnect=${encodeURIComponent(target.connectionId)}`;
}

export function getApiStatus(err: unknown): number | null {
  if (err instanceof ApiError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function looksUnsafeForUsers(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > MAX_USER_MESSAGE_LEN) return true;
  // Stack / internals / infra leakage.
  if (
    /traceback|exception|sqlalchemy|psycopg|asyncpg|pydantic|fastapi|starlette|uvicorn/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/file "\/|\\nat |line \d+|stack trace/i.test(t)) return true;
  if (/internal server error|^error:\s|http\/1\.|econnrefused|enotfound/i.test(t)) {
    return true;
  }
  // Env / config dumps and Plaid/raw codes alone.
  if (/WONEY_|LEDGER_|PLAID_(CLIENT|SECRET)|api[_ -]?key|secret[_ -]?key/i.test(t)) {
    return true;
  }
  if (/^ITEM_[A-Z0-9_]+$/.test(t) || /^[A-Z][A-Z0-9_]{6,}$/.test(t)) return true;
  // JSON / validation dumps.
  if (/^\s*[{\[]/.test(t) || /"loc"\s*:|"msg"\s*:|"type"\s*:/.test(t)) return true;
  if (/body\.[a-z_]+:|value is not a valid|field required/i.test(t)) return true;
  return false;
}

/** Allow only short, curated `user_message` from structured API detail. */
function allowlistedUserMessage(err: unknown): string | null {
  const obj = getApiDetailObject(err);
  if (!obj) return null;
  const msg = typeof obj.user_message === "string" ? obj.user_message.trim() : "";
  if (!msg || looksUnsafeForUsers(msg)) return null;
  return msg;
}

function messageFromCode(err: unknown): string | null {
  const obj = getApiDetailObject(err);
  if (obj && typeof obj.code === "string") {
    const mapped = CODE_MESSAGES[obj.code] ?? CODE_MESSAGES[obj.code.toUpperCase()];
    if (mapped) return mapped;
  }
  const detail = getApiDetail(err, "");
  for (const [code, message] of Object.entries(CODE_MESSAGES)) {
    if (detail === code || new RegExp(`\\b${code}\\b`, "i").test(detail)) {
      return message;
    }
  }
  return null;
}

/**
 * Map known backend phrases / statuses to friendly copy.
 * Never returns raw detail unless it already matches a curated phrase we own.
 */
function mapKnownDetail(detail: string, status: number | null): string | null {
  const lower = detail.toLowerCase().trim();
  if (!lower) return null;

  if (
    lower.includes("verification timed out") ||
    lower.includes("invalid or expired challenge") ||
    lower.includes("challenge expired") ||
    lower.includes("mfa challenge expired")
  ) {
    return "Verification timed out. Sign in again to get a new code.";
  }

  if (lower === "invalid code" || lower.includes("invalid authenticator")) {
    return "That code didn’t work. Try again.";
  }

  if (
    lower.includes("already registered") ||
    lower.includes("already exists") ||
    status === 409
  ) {
    return "An account with this email already exists. Sign in or reset your password.";
  }

  if (lower.includes("invalid email or password") || lower === "invalid credentials") {
    return "Invalid email or password.";
  }

  if (lower.includes("value is not a valid email") || lower.includes("not a valid email")) {
    return "Enter a valid email address.";
  }

  if (lower.includes("password") && (status === 422 || status === 400)) {
    return "Password does not meet the requirements.";
  }

  if (lower.includes("too many") || status === 429) {
    return "Too many attempts. Try again in a few minutes.";
  }

  if (lower.includes("redirect_uri")) {
    return "Google sign-in is misconfigured. Try again or use email instead.";
  }

  if (lower.includes("invalid_grant")) {
    return "Google sign-in expired or was reused. Click Continue with Google again.";
  }

  if (lower.includes("item_login_required") || lower.includes("reauth")) {
    return CODE_MESSAGES.ITEM_LOGIN_REQUIRED;
  }

  if (lower.includes("mfa_required")) {
    return CODE_MESSAGES.mfa_required;
  }

  if (
    lower.includes("plaid") &&
    (lower.includes("failed") || lower.includes("error") || lower.includes("unavailable"))
  ) {
    return "Could not connect to your bank. Please try again.";
  }

  if (lower.includes("network error") || lower.includes("failed to fetch")) {
    return "Network error — check your connection and try again.";
  }

  // Curated product copy we already own (safe to echo when backend sends the same string).
  const curated = [
    "Verification timed out. Sign in again to get a new code.",
    "Invalid email or password.",
    "Enter a valid email address.",
    "Password does not meet the requirements.",
    "Too many attempts. Try again in a few minutes.",
    "Google sign-in expired or was reused. Click Continue with Google again.",
    "That code didn’t work. Try again.",
  ];
  if (curated.some((c) => c.toLowerCase() === lower)) {
    return detail.trim();
  }

  return null;
}

function statusFallback(status: number | null, fallback: string): string {
  // 401 is highly contextual (login vs MFA vs session) — prefer caller fallback.
  if (status === 401) {
    if (fallback && fallback !== USER_ERROR_FALLBACK) return fallback;
    return "Please sign in again.";
  }
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "We couldn’t find what you were looking for.";
  if (status === 409) {
    return "An account with this email already exists. Sign in or reset your password.";
  }
  if (status === 422 || status === 400) return "Please check your details and try again.";
  if (status === 429) return "Too many attempts. Try again in a few minutes.";
  if (status === 502 || status === 503 || status === 504) {
    return "The service is temporarily unavailable. Try again shortly.";
  }
  if (status != null && status >= 500) {
    return "Something went wrong on our side. Please try again.";
  }
  return fallback;
}

/**
 * Central user-facing error mapper.
 * Prefer this (or `authErrorMessage`) everywhere UI shows API failures.
 */
export function userFacingError(
  err: unknown,
  fallback: string = USER_ERROR_FALLBACK,
): string {
  if (err instanceof TypeError) {
    return "Network error — check your connection and try again.";
  }

  const allowlisted = allowlistedUserMessage(err);
  if (allowlisted) return allowlisted;

  const fromCode = messageFromCode(err);
  if (fromCode) return fromCode;

  const status = getApiStatus(err);
  const detail = getApiDetail(err, "").trim();
  const mapped = mapKnownDetail(detail, status);
  if (mapped) return mapped;

  // Never pass through raw Error.message / FastAPI detail / statusText.
  return statusFallback(status, fallback);
}

/**
 * Sanitize a free-form string (query params, OAuth provider blurb) before UI.
 */
export function sanitizeUserMessage(
  raw: string | null | undefined,
  fallback: string = USER_ERROR_FALLBACK,
): string {
  const text = (raw ?? "").trim();
  if (!text) return fallback;
  const mapped = mapKnownDetail(text, null);
  if (mapped) return mapped;
  if (looksUnsafeForUsers(text)) return fallback;
  // Short, plain sentences only — reject codes / dumps.
  if (/^[A-Za-z0-9 _.,'’\-!?()]+$/.test(text) && text.length <= MAX_USER_MESSAGE_LEN) {
    return text;
  }
  return fallback;
}

/** User-facing copy for login / register / password-reset / MFA flows. */
export function authErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return userFacingError(err, fallback);
}
