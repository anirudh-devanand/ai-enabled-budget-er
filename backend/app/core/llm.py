"""Optional LLM gateway for enrichment and the assistant.

When WONEY_LLM_API_KEY is unset the gateway is a no-op so the rest of the
pipeline still works offline. Providers: anthropic (default) or openai.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class LlmMessage:
    role: str  # system | user | assistant | tool
    content: str
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class LlmToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LlmResponse:
    content: str | None
    tool_calls: list[LlmToolCall]


class LlmClient(Protocol):
    async def complete(
        self,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse: ...


class NullLlmClient:
    """Used when no API key is configured."""

    async def complete(
        self,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        return LlmResponse(content=None, tool_calls=[])


class AnthropicLlmClient:
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    async def complete(
        self,
        messages: list[LlmMessage],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.2,
    ) -> LlmResponse:
        system = "\n".join(m.content for m in messages if m.role == "system")
        body_messages = []
        for m in messages:
            if m.role == "system":
                continue
            if m.role == "tool":
                body_messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": m.tool_call_id,
                                "content": m.content,
                            }
                        ],
                    }
                )
            elif m.role == "assistant" and m.name:  # unused placeholder
                body_messages.append({"role": "assistant", "content": m.content})
            else:
                body_messages.append({"role": m.role, "content": m.content})

        payload: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 2048,
            "temperature": temperature,
            "messages": body_messages,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
                }
                for t in tools
            ]

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        content_text = None
        tool_calls: list[LlmToolCall] = []
        for block in data.get("content") or []:
            if block.get("type") == "text":
                content_text = (content_text or "") + block.get("text", "")
            elif block.get("type") == "tool_use":
                tool_calls.append(
                    LlmToolCall(
                        id=block["id"],
                        name=block["name"],
                        arguments=block.get("input") or {},
                    )
                )
        return LlmResponse(content=content_text, tool_calls=tool_calls)


def get_llm_client() -> LlmClient:
    settings = get_settings()
    if not settings.llm_api_key:
        return NullLlmClient()
    if settings.llm_provider == "anthropic":
        return AnthropicLlmClient(settings.llm_api_key, settings.llm_model)
    # OpenAI-compatible fallback via Anthropic-shaped client is intentionally
    # not implemented yet; null keeps the app functional without keys.
    logger.warning("Unknown LLM provider %s; using null client", settings.llm_provider)
    return NullLlmClient()


@dataclass
class MerchantProposal:
    merchant_name: str
    category_slug: str
    confidence: float


async def propose_merchant_category(
    client: LlmClient,
    descriptor: str,
    amount: str,
    category_slugs: list[str],
) -> MerchantProposal | None:
    """Ask the LLM to resolve a residual descriptor. Returns None if unavailable."""
    if isinstance(client, NullLlmClient):
        return None
    prompt = (
        "Resolve this bank transaction descriptor into a human merchant name and "
        "one category slug from the allowed list. Reply with ONLY JSON: "
        '{"merchant_name":"...","category_slug":"...","confidence":0.0-1.0}. '
        "If you cannot tell, set confidence below 0.6.\n"
        f"Descriptor: {descriptor}\nAmount: {amount}\n"
        f"Allowed categories: {', '.join(category_slugs)}"
    )
    try:
        result = await client.complete(
            [LlmMessage(role="user", content=prompt)], temperature=0.0
        )
    except Exception:
        logger.exception("LLM enrichment call failed")
        return None
    if not result.content:
        return None
    text = result.content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    slug = data.get("category_slug")
    name = data.get("merchant_name")
    conf = float(data.get("confidence") or 0)
    if not name or slug not in category_slugs or conf < 0.6:
        return None
    return MerchantProposal(merchant_name=str(name), category_slug=slug, confidence=min(conf, 1.0))
