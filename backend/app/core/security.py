import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet

from app.core.config import get_settings

_hasher = PasswordHasher()

ACCESS_TOKEN = "access"
MFA_CHALLENGE_TOKEN = "mfa_challenge"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def password_strength_ok(password: str) -> bool:
    """Match web register rules: length 10+ and at least 3 of 4 checks (score >= 3)."""
    if len(password) < 10 or len(password) > 128:
        return False
    passed = sum(
        [
            len(password) >= 10,
            any(c.isupper() for c in password),
            any(c.islower() for c in password),
            any(c.isdigit() for c in password) or any(not c.isalnum() for c in password),
        ]
    )
    return passed >= 3


def assert_password_strength(password: str) -> None:
    from fastapi import HTTPException, status

    if not password_strength_ok(password):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Password is too weak. Use at least 10 characters with a mix of "
            "upper/lowercase and a number or symbol.",
        )


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_mfa_challenge_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user_id),
        "type": MFA_CHALLENGE_TOKEN,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.mfa_challenge_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> uuid.UUID | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _fernet() -> Fernet:
    return Fernet(get_settings().data_encryption_key.encode())


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


# Field-level encryption for free-text columns (descriptors, notes).
# Prefix lets decrypt pass through legacy plaintext rows.
_FIELD_PREFIX = "enc:v1:"


def encrypt_field(value: str | None) -> str | None:
    """Encrypt a free-text field for at-rest storage. None/empty stay None."""
    if value is None:
        return None
    text = value.strip() if isinstance(value, str) else str(value)
    if not text:
        return None
    if text.startswith(_FIELD_PREFIX):
        return text
    return _FIELD_PREFIX + encrypt_secret(text)


def decrypt_field(value: str | None) -> str | None:
    """Decrypt an encrypt_field value; plaintext (legacy) returned as-is."""
    if value is None:
        return None
    if not value.startswith(_FIELD_PREFIX):
        return value
    try:
        return decrypt_secret(value[len(_FIELD_PREFIX) :])
    except Exception:
        return value
