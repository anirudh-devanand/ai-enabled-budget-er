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
