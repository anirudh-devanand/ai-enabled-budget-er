from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LEDGER_", extra="ignore")

    app_name: str = "ledger-api"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://ledger:ledger@localhost:5432/ledger"

    # Dev defaults only; production values come from a secrets manager.
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    mfa_challenge_minutes: int = 5

    # Fernet key for encrypting TOTP secrets at rest (base64, 32 bytes).
    data_encryption_key: str = "3jJ8mYIphC0v9tS2mvBrLnPuqcJZTsvUV84BxSZuXAo="


@lru_cache
def get_settings() -> Settings:
    return Settings()
