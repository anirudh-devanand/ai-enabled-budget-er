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


class MfaVerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class MfaEnrollResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaActivateRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class SessionInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_agent: str | None
    created_at: datetime
    expires_at: datetime
