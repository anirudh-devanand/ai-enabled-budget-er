import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MfaChallengeResponse(BaseModel):
    mfa_required: bool = True
    challenge_token: str
    primary_method: str = "email"  # email | totp | inline
    totp_available: bool = False
    message: str = "Enter your verification code"
    # Seconds until this challenge (JWT + email OTP) expires. Resend refreshes it.
    expires_in_seconds: int = 300
    # Only set in non-production when email is unavailable.
    dev_code: str | None = None


class MfaVerifyRequest(BaseModel):
    challenge_token: str
    # Email OTP (6 digits), TOTP, or recovery code.
    code: str = Field(min_length=6, max_length=32)


class MfaResendRequest(BaseModel):
    challenge_token: str


class MfaDisableRequest(BaseModel):
    # Password accounts must confirm password; OAuth-only may omit.
    password: str | None = None


class RefreshRequest(BaseModel):
    # Optional: mobile sends body; web may rely on HttpOnly cookie alone.
    refresh_token: str | None = None


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class MfaEnrollResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaActivateRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class MfaActivateResponse(BaseModel):
    recovery_codes: list[str]


class MfaRecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class SessionInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_agent: str | None
    created_at: datetime
    expires_at: datetime


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestResponse(BaseModel):
    message: str
    delivery: str = "none"  # email | dev_log | none
    # Only set in non-production when Resend is not configured (never in prod).
    dev_reset_url: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    password: str = Field(min_length=10, max_length=128)
