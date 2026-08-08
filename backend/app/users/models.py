import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), default=None)
    display_name: Mapped[str] = mapped_column(String(120))
    oauth_provider: Mapped[str | None] = mapped_column(String(40), default=None)
    oauth_subject: Mapped[str | None] = mapped_column(String(255), default=None)
    # Encrypted TOTP secret; set during MFA enrollment, active once mfa_enabled.
    mfa_secret: Mapped[str | None] = mapped_column(String(255), default=None)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # JSON list of sha256 hex hashes for one-time MFA recovery codes.
    mfa_recovery_hashes: Mapped[str | None] = mapped_column(Text, default=None)
    # SnapTrade Commercial: stable partner user id + encrypted userSecret.
    snaptrade_user_id: Mapped[str | None] = mapped_column(String(64), default=None)
    snaptrade_user_secret_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
