from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.account.router import router as account_router
from app.assistant.router import router as assistant_router
from app.auth.router import router as auth_router
from app.budgets.router import router as budgets_router
from app.connections.router import router as connections_router
from app.core.config import get_settings
from app.core.database import get_engine
from app.enrichment.router import categories_router, transactions_router
from app.households.router import router as households_router
from app.metrics.router import router as metrics_router
from app.notifications.router import ops_router, router as notifications_router
from app.planner.router import router as goals_router
from app.users.router import router as users_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail fast on boot if production secrets are missing.
    get_settings().assert_production_safe()
    yield


app = FastAPI(
    title="Woney API",
    version="0.2.0",
    debug=settings.debug,
    lifespan=lifespan,
)

origins = settings.cors_origin_list()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(account_router)
app.include_router(households_router)
app.include_router(connections_router)
app.include_router(categories_router)
app.include_router(transactions_router)
app.include_router(budgets_router)
app.include_router(metrics_router)
app.include_router(goals_router)
app.include_router(assistant_router)
app.include_router(notifications_router)
app.include_router(ops_router)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    """Liveness + non-secret config flags (helps verify Render env vars)."""
    from fastapi import HTTPException

    s = get_settings()
    flags = {
        "plaid_configured": s.plaid_configured,
        "plaid_env": s.plaid_env,
        "google_oauth_configured": s.google_oauth_configured,
        "apple_oauth_configured": s.apple_oauth_configured,
        "microsoft_oauth_configured": s.microsoft_oauth_configured,
        "llm_configured": bool(s.llm_api_key),
        "email_configured": bool(s.resend_api_key and s.email_from),
    }
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "up", **flags}
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail={"status": "degraded", "database": "down", **flags}
        ) from exc
