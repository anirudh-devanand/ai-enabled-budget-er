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


async def complete_mfa_if_needed(client, resp, *, headers: dict | None = None):
    """If login/OAuth returned an MFA challenge, verify with inline ``dev_code``.

    Returns the final response (token-bearing) and its JSON body.
    """
    assert resp.status_code == 200, resp.text
    body = resp.json()
    if not body.get("mfa_required"):
        return resp, body
    code = body.get("dev_code")
    assert code, "expected inline MFA code when email is not configured in tests"
    kwargs = {"json": {"challenge_token": body["challenge_token"], "code": code}}
    if headers:
        kwargs["headers"] = headers
    verified = await client.post("/v1/auth/mfa/verify", **kwargs)
    assert verified.status_code == 200, verified.text
    return verified, verified.json()


async def login_complete(client, email: str, password: str, *, headers: dict | None = None):
    """Password login + MFA verify when challenged. Returns (response, token body)."""
    kwargs: dict = {"json": {"email": email, "password": password}}
    if headers:
        kwargs["headers"] = headers
    resp = await client.post("/v1/auth/login", **kwargs)
    return await complete_mfa_if_needed(client, resp, headers=headers)


async def register_and_login(client, payload) -> dict:
    resp = await client.post("/v1/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    _, body = await login_complete(client, payload["email"], payload["password"])
    return body


async def disable_mfa(client, tokens: dict, password: str) -> None:
    """Turn off login MFA (email + authenticator challenges)."""
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = await client.post(
        "/v1/auth/mfa/disable",
        json={"password": password},
        headers=auth,
    )
    assert resp.status_code == 204, resp.text


async def enable_mfa(client, tokens: dict) -> str:
    """Enroll + activate TOTP authenticator; returns the TOTP secret."""
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = await client.post("/v1/auth/mfa/enroll", headers=auth)
    assert resp.status_code == 200, resp.text
    secret = resp.json()["secret"]
    code = pyotp.TOTP(secret).now()
    resp = await client.post("/v1/auth/mfa/activate", json={"code": code}, headers=auth)
    assert resp.status_code == 200, resp.text
    return secret
