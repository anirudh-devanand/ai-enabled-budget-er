from typing import Literal

from pydantic import BaseModel, Field


class DeleteRequestResponse(BaseModel):
    delivery: Literal["email", "totp", "inline"]
    expires_in_seconds: int
    requires_password: bool
    message: str
    # Plain code only when delivery=inline (no email infra / MFA). Never logged.
    code: str | None = None


class DeleteConfirmRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    confirm: str = Field(description='Must be exactly "DELETE"')
    password: str | None = Field(default=None, min_length=8, max_length=128)
    # OAuth-only users: re-type email as identity confirmation.
    email_confirm: str | None = Field(default=None, max_length=320)


class DeleteConfirmResponse(BaseModel):
    deleted: bool = True
