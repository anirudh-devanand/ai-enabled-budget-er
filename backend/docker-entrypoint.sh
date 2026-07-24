#!/bin/sh
set -e
# Prefer WONEY_DATABASE_URL; fall back to LEDGER_DATABASE_URL during rename.
if [ -z "$WONEY_DATABASE_URL" ] && [ -n "$LEDGER_DATABASE_URL" ]; then
  export WONEY_DATABASE_URL="$LEDGER_DATABASE_URL"
fi

# Render and some hosts provide postgres:// or postgresql:// — we need +asyncpg.
if [ -n "$WONEY_DATABASE_URL" ]; then
  case "$WONEY_DATABASE_URL" in
    postgres://*)
      export WONEY_DATABASE_URL="postgresql+asyncpg://${WONEY_DATABASE_URL#postgres://}"
      ;;
    postgresql://*)
      export WONEY_DATABASE_URL="postgresql+asyncpg://${WONEY_DATABASE_URL#postgresql://}"
      ;;
  esac
  # Managed Postgres usually requires TLS; skip for local compose hosts.
  case "$WONEY_DATABASE_URL" in
    *@localhost*|*@127.0.0.1*|*@postgres:*|*@postgres/*) ;;
    *sslmode=*|*ssl=*) ;;
    *)
      case "$WONEY_DATABASE_URL" in
        *\?*) export WONEY_DATABASE_URL="${WONEY_DATABASE_URL}&ssl=require" ;;
        *) export WONEY_DATABASE_URL="${WONEY_DATABASE_URL}?ssl=require" ;;
      esac
      ;;
  esac
  # Keep LEDGER_DATABASE_URL in sync if present (legacy tooling / dashboards).
  export LEDGER_DATABASE_URL="$WONEY_DATABASE_URL"
fi
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
