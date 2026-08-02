"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MessageResponse } from "@woney/api-client";
import { FadeIn } from "@/components/MotionEnter";
import { AssistantSkeleton } from "@/components/Skeleton";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized, userFacingError } from "@/lib/errors";

export default function AssistantPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [input, setInput] = useState("How much did I spend on dining lately?");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) {
          setError("No household found. Create one before chatting.");
          return;
        }
        const convo = await api.createConversation(hid);
        setConversationId(convo.id);
        setError(null);
      } catch (err) {
        if (isUnauthorized(err)) {
          router.replace("/login");
          return;
        }
        setError(userFacingError(err, "Could not start chat. Please try again."));
      } finally {
        setReady(true);
      }
    })();
  }, [router]);

  async function send() {
    const text = input.trim();
    if (!conversationId || !text || busy) return;
    setBusy(true);
    setError(null);
    const userMsg: MessageResponse = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      tool_name: null,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    try {
      const reply = await api.sendChat(conversationId, text);
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      if (isUnauthorized(err)) {
        router.replace("/login");
        return;
      }
      setError(userFacingError(err, "Could not send that message. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const canSend = Boolean(conversationId) && Boolean(input.trim()) && !busy;

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Assistant</h1>
          <p>
            Ask about spending, budgets, or goals — answers use privacy-filtered
            summaries from your data. Full account numbers are never sent to the AI.
          </p>
        </div>
      </div>

      {!ready ? (
        <AssistantSkeleton />
      ) : (
        <FadeIn>
          <div className="list-card" style={{ minHeight: 360, padding: 20 }}>
            {messages.length === 0 && !error && (
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
            {error && (
              <p className="error" style={{ marginTop: messages.length ? 8 : 0 }}>
                {error}
              </p>
            )}
          </div>

          <div className="assistant-composer" style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <input
              className="assistant-input"
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask Woney…"
              aria-label="Message"
              disabled={busy || !conversationId}
            />
            <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={!canSend}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </FadeIn>
      )}
    </AppShell>
  );
}
