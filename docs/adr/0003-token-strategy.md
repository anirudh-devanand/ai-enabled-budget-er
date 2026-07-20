# ADR 0003: Access/refresh token strategy

Status: accepted

## Context

Financial data demands short exposure windows for credentials while keeping users logged in for
long periods on mobile.

## Decision

- Access tokens: JWT (HS256 for now, key from settings/secrets manager), 15-minute lifetime,
  carrying only `sub` (user id), `exp`, and `type: access`. Stateless verification.
- Refresh tokens: 256-bit opaque random strings, 30-day lifetime, stored server-side as SHA-256
  hashes in `auth_sessions` with user agent and expiry. Rotated on every refresh: the presented
  session is revoked and a new one issued. Reuse of a revoked token fails.
- Session revocation: logout revokes one session; logout-all revokes every session for the user.
  Access tokens are not blacklisted - the 15-minute window bounds exposure after revocation.
- Passwords hashed with argon2id.

## Consequences

- Refresh requires a database hit; acceptable, and it gives instant revocation and a "log out
  all devices" feature.
- Moving to RS256 with a JWKS endpoint is a config change if third-party token verification is
  ever needed.
