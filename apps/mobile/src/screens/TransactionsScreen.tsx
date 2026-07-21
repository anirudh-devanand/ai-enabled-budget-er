import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TransactionResponse } from "@ledger/api-client";
import { api } from "../api";
import { colors, money } from "../theme";

export function TransactionsScreen() {
  const [items, setItems] = useState<TransactionResponse[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const households = await api.listHouseholds();
      const id = households[0]?.id;
      if (!id) {
        setItems([]);
        return;
      }
      const list = await api.listTransactions(id, 50);
      setItems(list.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.accent} />}
    >
      <Text style={styles.h1}>Transactions</Text>
      {items.map((t) => (
        <View style={styles.row} key={t.id}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t.display_name}</Text>
            <Text style={styles.muted}>
              {t.date}
              {t.category_name ? ` · ${t.category_name}` : ""}
              {t.needs_review ? " · review" : ""}
            </Text>
          </View>
          <Text style={[styles.amount, Number(t.amount) < 0 && { color: colors.danger }]}>
            {money(t.amount, t.currency)}
          </Text>
        </View>
      ))}
      {!busy && items.length === 0 && <Text style={styles.muted}>No transactions yet.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && items.length === 0 && <ActivityIndicator color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 12 },
  row: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  title: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 2, fontSize: 13 },
  amount: { color: colors.text, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 12 },
});
