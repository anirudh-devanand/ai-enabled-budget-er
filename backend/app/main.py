from fastapi import FastAPI

from app.auth.router import router as auth_router
from app.connections.router import router as connections_router
from app.core.config import get_settings
from app.enrichment.router import categories_router, transactions_router
from app.households.router import router as households_router
from app.users.router import router as users_router

settings = get_settings()

app = FastAPI(title="Ledger API", version="0.1.0", debug=settings.debug)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(households_router)
app.include_router(connections_router)
app.include_router(categories_router)
app.include_router(transactions_router)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
