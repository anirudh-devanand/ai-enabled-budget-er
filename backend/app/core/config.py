from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LEDGER_", extra="ignore")

    app_name: str = "ledger-api"
    env: str = "development"  # development | production
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

    # Comma-separated browser origins allowed for CORS (empty = allow all in development).
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Shared secret for cron/batch ops (X-Ops-Token). Required in production for /v1/ops/*.
    ops_token: str | None = None

    # Flinks (Canadian bank aggregation). Defaults point at the public sandbox.
    flinks_base_url: str = "https://toolbox-api.private.fin.ag"
    flinks_customer_id: str = "43387ca6-0391-4c82-857d-70d95f087ecb"
    flinks_auth_key: str | None = None
    flinks_days_of_transactions: str = "Days365"

    # Optional LLM (Anthropic). When unset, enrichment/assistant skip LLM stages.
    llm_api_key: str | None = None
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-4-20250514"
    embedding_match_threshold: float = 0.72
    llm_enrichment_min_confidence: float = 0.7

    @field_validator("env")
    @classmethod
    def normalize_env(cls, value: str) -> str:
        return value.strip().lower()

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def assert_production_safe(self) -> None:
        if self.env != "production":
            return
        problems: list[str] = []
        if self.jwt_secret in ("", "dev-only-change-me"):
            problems.append("LEDGER_JWT_SECRET must be set to a strong random value")
        if self.data_encryption_key == "3jJ8mYIphC0v9tS2mvBrLnPuqcJZTsvUV84BxSZuXAo=":
            problems.append("LEDGER_DATA_ENCRYPTION_KEY must be a unique Fernet key")
        if not self.ops_token:
            problems.append("LEDGER_OPS_TOKEN must be set for cron/ops endpoints")
        if not self.cors_origin_list():
            problems.append("LEDGER_CORS_ORIGINS must list at least one web origin")
        if problems:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.assert_production_safe()
    return settings
