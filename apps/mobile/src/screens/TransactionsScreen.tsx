import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TransactionResponse } from "@woney/api-client";
import { api } from "../api";
import { CategoryIcon } from "../components/ui";
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
      <Text style={styles.h1}>Activity</Text>
      <Text style={styles.lede}>Clear names — never vague bank descriptors.</Text>
      <View style={styles.list}>
        {items.map((t) => (
          <View style={styles.row} key={t.id}>
            <CategoryIcon name={t.category_name} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {t.display_name}
              </Text>
              <Text style={styles.muted}>
                {t.date}
                {t.category_name ? ` · ${t.category_name}` : ""}
                {t.needs_review ? " · review" : ""}
              </Text>
            </View>
            <Text
              style={[styles.amount, Number(t.amount) >= 0 && { color: colors.positive }]}
            >
              {money(t.amount, t.currency)}
            </Text>
          </View>
        ))}
      </View>
      {!busy && items.length === 0 && <Text style={styles.muted}>No transactions yet.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && items.length === 0 && <ActivityIndicator color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 14, marginTop: 2 },
  list: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 2, fontSize: 12 },
  amount: { color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] },
  error: { color: colors.danger, marginTop: 12 },
});
