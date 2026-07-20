import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class HouseholdCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class HouseholdMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    role: str
    created_at: datetime


class HouseholdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class HouseholdDetailResponse(HouseholdResponse):
    members: list[HouseholdMemberResponse]


class HouseholdInviteRequest(BaseModel):
    email: EmailStr
