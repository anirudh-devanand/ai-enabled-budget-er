#!/bin/sh
set -e
# Render and some hosts provide postgres:// or postgresql:// — we need +asyncpg.
if [ -n "$LEDGER_DATABASE_URL" ]; then
  case "$LEDGER_DATABASE_URL" in
    postgres://*)
      export LEDGER_DATABASE_URL="postgresql+asyncpg://${LEDGER_DATABASE_URL#postgres://}"
      ;;
    postgresql://*)
      export LEDGER_DATABASE_URL="postgresql+asyncpg://${LEDGER_DATABASE_URL#postgresql://}"
      ;;
  esac
  # Managed Postgres usually requires TLS; skip for local compose hosts.
  case "$LEDGER_DATABASE_URL" in
    *@localhost*|*@127.0.0.1*|*@postgres:*|*@postgres/*) ;;
    *sslmode=*|*ssl=*) ;;
    *)
      case "$LEDGER_DATABASE_URL" in
        *\?*) export LEDGER_DATABASE_URL="${LEDGER_DATABASE_URL}&ssl=require" ;;
        *) export LEDGER_DATABASE_URL="${LEDGER_DATABASE_URL}?ssl=require" ;;
      esac
      ;;
  esac
fi
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
