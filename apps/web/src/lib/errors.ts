import { ApiError } from "@woney/api-client";

export function isUnauthorized(err: unknown): boolean {
  return getApiStatus(err) === 401;
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

  if (status === 502 || status === 503) {
    return detail || "The service is temporarily unavailable. Try again shortly.";
  }

  if (detail) return detail;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
