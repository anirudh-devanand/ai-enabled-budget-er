"""CLI: seed demo bank history for a user.

  cd backend
  set LEDGER_DATABASE_URL=postgresql+asyncpg://...
  python -m scripts.seed_demo_history --email anirudh.d.575@gmail.com
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.ops.seed_demo import SeedDemoRequest, seed_demo_history


async def main(email: str, days: int) -> int:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:  # type: AsyncSession
        try:
            result = await seed_demo_history(
                db, SeedDemoRequest(email=email, days=days, replace_existing_demo=True)
            )
        except LookupError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        print(
            f"Seeded {result.institution_name}: "
            f"{result.accounts} accounts, {result.transactions} transactions "
            f"for {email} (household {result.household_id})"
        )
    await engine.dispose()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--days", type=int, default=180)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.email, args.days)))
