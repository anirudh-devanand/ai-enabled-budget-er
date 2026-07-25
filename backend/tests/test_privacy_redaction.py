"""Assistant privacy: redaction + LLM-safe tool payloads."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from uuid import uuid4

import pytest

from app.assistant.privacy import (
    cap_history,
    redact_user_text,
    sanitize_for_llm,
    sanitize_tool_payload,
)
from app.core.llm import LlmMessage, LlmResponse
from tests.test_budgets_goals_assistant import _setup

UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


def test_redact_user_text_scrubs_secrets():
    raw = (
        "My card is 4111 1111 1111 1111 and SIN 123 456 789. "
        "Email me at user@example.com password: hunter2 "
        "key sk-abcdefghijklmnopqrstuvwxyz123456 "
        "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig "
        "access-sandbox-abc-def"
    )
    out = redact_user_text(raw)
    assert "4111" not in out
    assert "[REDACTED_ACCOUNT]" in out
    assert "[REDACTED_SIN]" in out
    assert "[REDACTED_EMAIL]" in out
    assert "[REDACTED_SECRET]" in out
    assert "[REDACTED_TOKEN]" in out
    assert "hunter2" not in out


def test_sanitize_net_worth_strips_ids_and_masks():
    payload = {
        "total": Decimal("1000.00"),
        "currency": "CAD",
        "accounts": [
            {
                "id": uuid4(),
                "name": "Everyday Chequing",
                "balance": Decimal("500"),
                "type": "depository",
                "masked_number": "4821",
            }
        ],
    }
    safe = sanitize_tool_payload("get_net_worth", payload)
    blob = json.dumps(safe)
    assert "4821" not in blob
    assert "masked_number" not in blob
    assert not UUID_RE.search(blob)
    assert safe["accounts"][0]["display_name"] == "Chequing"
    assert "balance" in safe["accounts"][0]


def test_sanitize_spending_drops_category_ids():
    safe = sanitize_tool_payload(
        "get_spending_summary",
        [{"category_id": uuid4(), "name": "Dining", "amount": "12.00"}],
    )
    assert safe == [{"name": "Dining", "amount": "12.00"}]


def test_sanitize_for_llm_scrubs_pan_in_messages():
    msgs = sanitize_for_llm(
        [
            LlmMessage(role="system", content="sys"),
            LlmMessage(role="user", content="card 4111111111111111 please"),
        ]
    )
    assert "[REDACTED_ACCOUNT]" in msgs[1].content
    assert "4111111111111111" not in msgs[1].content


def test_cap_history_keeps_system_and_tail():
    msgs = [LlmMessage(role="system", content="s")]
    for i in range(20):
        msgs.append(LlmMessage(role="user", content=f"u{i}"))
        msgs.append(LlmMessage(role="assistant", content=f"a{i}"))
    capped = cap_history(msgs, max_turns=4)
    assert capped[0].role == "system"
    assert len([m for m in capped if m.role != "system"]) == 4


def test_plaid_mask_never_exceeds_four_digits():
    mask = "123456789012"
    truncated = str(mask)[-4:]
    assert truncated == "9012"
    assert len(truncated) <= 4


async def test_metrics_payload_sanitizes_for_llm(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    nw = await client.get(
        f"/v1/metrics/net-worth?household_id={household_id}", headers=headers
    )
    assert nw.status_code == 200
    # Raw API may include ids for the app UI; LLM path must strip them.
    safe = sanitize_tool_payload("get_net_worth", nw.json())
    blob = json.dumps(safe)
    assert "masked_number" not in blob
    assert not UUID_RE.search(blob)
    assert "total" in safe


async def test_chat_persists_redacted_user_text(client, register_payload, monkeypatch):
    headers, household_id = await _setup(client, register_payload)

    class CaptureLlm:
        def __init__(self) -> None:
            self.last: list[LlmMessage] = []

        async def complete(self, messages, tools=None, temperature=0.2):
            self.last = list(messages)
            return LlmResponse(content="All clear.", tool_calls=[])

    capture = CaptureLlm()
    monkeypatch.setattr(
        "app.assistant.service.get_llm_client", lambda: capture
    )

    convo = await client.post(
        "/v1/assistant/conversations",
        json={"household_id": household_id},
        headers=headers,
    )
    assert convo.status_code == 201, convo.text
    cid = convo.json()["id"]

    msg = await client.post(
        f"/v1/assistant/conversations/{cid}/messages",
        json={"message": "My account number is 4111111111111111"},
        headers=headers,
    )
    assert msg.status_code == 200, msg.text

    history = await client.get(
        f"/v1/assistant/conversations/{cid}/messages", headers=headers
    )
    assert history.status_code == 200
    user_msgs = [m for m in history.json() if m["role"] == "user"]
    assert user_msgs
    assert "4111111111111111" not in user_msgs[0]["content"]
    assert "[REDACTED_ACCOUNT]" in user_msgs[0]["content"]

    outbound = " ".join(m.content for m in capture.last)
    assert "4111111111111111" not in outbound
    assert capture.last, "LLM client should have been invoked"


async def test_healthz_privacy_flags(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["llm_privacy_strict"] is True
    assert "llm_enabled" in body
