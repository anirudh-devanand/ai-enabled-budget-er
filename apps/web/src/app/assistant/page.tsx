"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MessageResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

export default function AssistantPage() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [input, setInput] = useState("How much did I spend on dining lately?");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id;
        if (!hid) return;
        const convo = await api.createConversation(hid);
        setConversationId(convo.id);
      } catch {
        router.replace("/login");
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
    <div className="shell">
      <header>
        <h1>AI assistant</h1>
        <button onClick={() => router.push("/dashboard")}>Dashboard</button>
      </header>

      <div className="tile" style={{ minHeight: 320 }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--muted)" }}>
            Ask about spending, budgets, or goals. Without an LLM API key the assistant still
            answers from your live account data.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 14 }}>
            <strong style={{ color: "var(--muted)" }}>
              {m.role === "user" ? "You" : "Ledger"}
            </strong>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{m.content}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <input
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="primary" style={{ width: "auto", marginTop: 0 }} onClick={send} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}
