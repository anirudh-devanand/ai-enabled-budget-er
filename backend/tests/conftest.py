import os

# Configure before app imports read settings.
os.environ["WONEY_DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["WONEY_JWT_SECRET"] = "test-secret"
os.environ["WONEY_OPS_TOKEN"] = "test-ops-token"

import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.rate_limit import reset_rate_limits_for_tests
from app.main import app


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    reset_rate_limits_for_tests()
    yield
    reset_rate_limits_for_tests()


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture
def register_payload():
    return {
        "email": "ada@example.com",
        "password": "correct-horse-battery",
        "display_name": "Ada",
    }


async def register_and_login(client, payload) -> dict:
    resp = await client.post("/v1/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    resp = await client.post(
        "/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def enable_mfa(client, tokens: dict) -> str:
    """Enroll + activate TOTP MFA; returns the TOTP secret."""
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = await client.post("/v1/auth/mfa/enroll", headers=auth)
    assert resp.status_code == 200, resp.text
    secret = resp.json()["secret"]
    code = pyotp.TOTP(secret).now()
    resp = await client.post("/v1/auth/mfa/activate", json={"code": code}, headers=auth)
    assert resp.status_code == 200, resp.text
    return secret
