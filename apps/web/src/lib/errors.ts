import { ApiError } from "@ledger/api-client";

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
