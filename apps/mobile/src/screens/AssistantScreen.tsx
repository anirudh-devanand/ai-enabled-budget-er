import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError } from "@woney/api-client";
import { api } from "../api";
import { colors } from "../theme";

export function AssistantScreen() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState("How am I doing this month?");
  const [replies, setReplies] = useState<{ role: string; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const id = households[0]?.id;
        if (!id) return;
        const conv = await api.createConversation(id);
        setConversationId(conv.id);
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Could not start chat");
      }
    })();
  }, []);

  async function send() {
    if (!conversationId || !message.trim()) return;
    setBusy(true);
    setError(null);
    const userMsg = message.trim();
    setMessage("");
    setReplies((r) => [...r, { role: "user", content: userMsg }]);
    try {
      const resp = await api.sendChat(conversationId, userMsg);
      setReplies((r) => [...r, { role: resp.role, content: resp.content }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Ask Woney</Text>
        <Text style={styles.lede}>Answers grounded in your live account data.</Text>
        {replies.length === 0 && (
          <Text style={styles.muted}>Try “How much did I spend on dining?”</Text>
        )}
        {replies.map((r, i) => (
          <View
            key={`${i}-${r.role}`}
            style={[styles.bubble, r.role === "user" ? styles.user : styles.assistant]}
          >
            <Text style={styles.bubbleLabel}>{r.role === "user" ? "You" : "Woney"}</Text>
            <Text style={styles.bubbleText}>{r.content}</Text>
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="Ask about spending, budgets, goals…"
          placeholderTextColor={colors.muted}
          editable={!busy}
        />
        <Pressable style={styles.button} onPress={send} disabled={busy || !conversationId}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 24 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 14, marginTop: 2 },
  muted: { color: colors.muted, marginBottom: 12 },
  bubble: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    maxWidth: "92%",
  },
  user: { backgroundColor: colors.accentSoft, alignSelf: "flex-end" },
  assistant: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  bubbleLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  bubbleText: { color: colors.text, lineHeight: 20 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    gap: 8,
    backgroundColor: colors.card,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#1a1814", fontWeight: "700" },
  error: { color: colors.danger, marginTop: 8 },
});
