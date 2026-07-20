import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant import service
from app.core.database import get_db
from app.core.deps import get_current_user
from app.users.models import User

router = APIRouter(prefix="/v1/assistant", tags=["assistant"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class ConversationCreateRequest(BaseModel):
    household_id: uuid.UUID


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    title: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    tool_name: str | None


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    body: ConversationCreateRequest, user: CurrentUser, db: DbDep
):
    try:
        return await service.create_conversation(db, user.id, body.household_id)
    except PermissionError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found") from None


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: uuid.UUID, body: ChatRequest, user: CurrentUser, db: DbDep
):
    convo = await service.get_conversation_for_user(db, conversation_id, user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return await service.chat(db, convo, body.message)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(conversation_id: uuid.UUID, user: CurrentUser, db: DbDep):
    convo = await service.get_conversation_for_user(db, conversation_id, user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return await service.list_messages(db, conversation_id)
