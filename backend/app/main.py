from fastapi import FastAPI

from app.assistant.router import router as assistant_router
from app.auth.router import router as auth_router
from app.budgets.router import router as budgets_router
from app.connections.router import router as connections_router
from app.core.config import get_settings
from app.enrichment.router import categories_router, transactions_router
from app.households.router import router as households_router
from app.metrics.router import router as metrics_router
from app.notifications.router import ops_router, router as notifications_router
from app.planner.router import router as goals_router
from app.users.router import router as users_router

settings = get_settings()

app = FastAPI(title="Ledger API", version="0.1.0", debug=settings.debug)

app.include_router(auth_router)
app.include_router(users_router)
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
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
