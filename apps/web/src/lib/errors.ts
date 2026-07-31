import { ApiError, getApiDetailObject } from "@woney/api-client";

export type BankReauthTarget = {
  connectionId: string;
  householdId: string;
  institutionName: string | null;
  code: string;
};

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

/** User-facing copy for login / register / password-reset flows. */
export function authErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof TypeError) {
    return "Network error — check your connection or API URL, then try again.";
  }

  const status = getApiStatus(err);
  const detail = getApiDetail(err, "").trim();
  const lower = detail.toLowerCase();

  if (
    status === 409 ||
    lower.includes("already registered") ||
    lower.includes("already exists")
  ) {
    return (
      detail ||
      "An account with this email already exists. Sign in or reset your password."
    );
  }

  if (status === 422) {
    if (lower.includes("email") || lower.includes("value is not a valid email")) {
      return "Enter a valid email address.";
    }
    if (lower.includes("password")) {
      return detail || "Password does not meet the requirements.";
    }
    return detail || "Please check your details and try again.";
  }

  if (status === 400) {
    return detail || "Please check your details and try again.";
  }

  if (status === 401) {
    return detail || "Invalid email or password.";
  }

  if (status === 429) {
    return detail || "Too many attempts. Try again in a few minutes.";
  }

  if (
    status === 502 ||
    status === 503 ||
    lower.includes("redirect_uri") ||
    lower.includes("invalid_grant")
  ) {
    if (lower.includes("redirect_uri")) {
      return (
        detail ||
        "Google rejected the redirect URI. Confirm the callback URL is listed in Google Cloud Console."
      );
    }
    if (lower.includes("invalid_grant")) {
      return "Google sign-in expired or was reused. Click Continue with Google again.";
    }
    return detail || "The service is temporarily unavailable. Try again shortly.";
  }

  if (detail) return detail;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
