"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MessageResponse } from "@ledger/api-client";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";

export default function AssistantPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [input, setInput] = useState("How much did I spend on dining lately?");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) return;
        const convo = await api.createConversation(hid);
        setConversationId(convo.id);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      }
    })();
  }, [router]);

  async function send() {
    if (!conversationId || !input.trim()) return;
    setBusy(true);
    try {
      const reply = await api.sendChat(conversationId, input.trim());
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: input, tool_name: null },
        reply,
      ]);
      setInput("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Assistant</h1>
          <p>Ask about spending, budgets, or goals — answers grounded in your data.</p>
        </div>
      </div>

      <div className="list-card" style={{ minHeight: 360, padding: 20 }}>
        {messages.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            Try “How much did I spend on dining?” or “Am I on track this month?”
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 16,
              maxWidth: "85%",
              marginLeft: m.role === "user" ? "auto" : 0,
              background: m.role === "user" ? "var(--accent-soft)" : "var(--surface-muted)",
              borderRadius: 16,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--muted)",
                marginBottom: 4,
              }}
            >
              {m.role === "user" ? "You" : "Woney"}
            </div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <input
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Woney…"
          aria-label="Message"
        />
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
      </div>
    </AppShell>
  );
}
