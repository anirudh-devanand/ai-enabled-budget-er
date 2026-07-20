import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.models import Conversation, Message
from app.assistant.tools import TOOL_SPECS, run_tool
from app.connections.service import user_in_household
from app.core.llm import LlmClient, LlmMessage, NullLlmClient, get_llm_client


SYSTEM_PROMPT = (
    "You are Ledger, a personal finance assistant. Answer using tools that read the "
    "user's real data. Never invent balances or transactions. Do not give specific "
    "securities recommendations. Keep answers concise and cite numbers from tool results. "
    "You may include a chart hint as JSON on its own line like "
    'CHART:{"type":"bar","title":"...","data":[{"label":"x","value":1}]} when useful.'
)


async def create_conversation(
    db: AsyncSession, user_id: uuid.UUID, household_id: uuid.UUID
) -> Conversation:
    if not await user_in_household(db, user_id, household_id):
        raise PermissionError("not a household member")
    convo = Conversation(user_id=user_id, household_id=household_id)
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return convo


async def get_conversation_for_user(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Conversation | None:
    convo = await db.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user_id:
        return None
    return convo


async def list_messages(db: AsyncSession, conversation_id: uuid.UUID) -> list[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return list(result.scalars().all())


async def chat(
    db: AsyncSession,
    conversation: Conversation,
    user_text: str,
    llm: LlmClient | None = None,
) -> Message:
    """Append a user message, run the LLM tool loop, return the assistant message."""
    db.add(Message(conversation_id=conversation.id, role="user", content=user_text))
    await db.flush()

    llm = llm if llm is not None else get_llm_client()
    history = await list_messages(db, conversation.id)
    messages = [LlmMessage(role="system", content=SYSTEM_PROMPT)]
    for m in history:
        if m.role in ("user", "assistant"):
            messages.append(LlmMessage(role=m.role, content=m.content))

    # Offline / no-key path: deterministic tool-backed answer without an LLM.
    if isinstance(llm, NullLlmClient):
        spending = await run_tool(db, conversation.household_id, "get_spending_summary", {})
        net = await run_tool(db, conversation.household_id, "get_net_worth", {})
        reply = (
            f"Here's what I can see from your accounts (no LLM key configured).\n"
            f"Net worth: {net}\n"
            f"Recent spending by category: {spending}\n"
            f"You asked: {user_text}"
        )
        assistant = Message(
            conversation_id=conversation.id, role="assistant", content=reply
        )
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)
        return assistant

    # Tool loop (max 4 rounds).
    for _ in range(4):
        response = await llm.complete(messages, tools=TOOL_SPECS)
        if response.tool_calls:
            for call in response.tool_calls:
                result = await run_tool(
                    db, conversation.household_id, call.name, call.arguments
                )
                db.add(
                    Message(
                        conversation_id=conversation.id,
                        role="tool",
                        content=result,
                        tool_name=call.name,
                    )
                )
                messages.append(
                    LlmMessage(
                        role="tool",
                        content=result,
                        tool_call_id=call.id,
                        name=call.name,
                    )
                )
            continue
        content = response.content or "I couldn't generate a response."
        assistant = Message(
            conversation_id=conversation.id, role="assistant", content=content
        )
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)
        return assistant

    assistant = Message(
        conversation_id=conversation.id,
        role="assistant",
        content="I hit the tool-call limit. Try a more specific question.",
    )
    db.add(assistant)
    await db.commit()
    await db.refresh(assistant)
    return assistant
