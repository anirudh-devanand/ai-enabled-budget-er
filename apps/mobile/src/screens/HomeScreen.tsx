import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AccountResponse, HouseholdResponse, TransactionResponse } from "@ledger/api-client";
import { api } from "../api";
import { colors, money } from "../theme";

type Props = {
  onOpenConnect: () => void;
};

export function HomeScreen({ onOpenConnect }: Props) {
  const [household, setHousehold] = useState<HouseholdResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [txns, setTxns] = useState<TransactionResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const households = await api.listHouseholds();
      const first = households[0] ?? null;
      setHousehold(first);
      if (!first) {
        setAccounts([]);
        setTxns([]);
        return;
      }
      const [accs, list] = await Promise.all([
        api.listAccounts(first.id),
        api.listTransactions(first.id, 12),
      ]);
      setAccounts(accs);
      setTxns(list.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const net = accounts.reduce((s, a) => s + Number(a.balance), 0);

  if (busy && accounts.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.accent} />}
    >
      <Text style={styles.h1}>{household?.name ?? "Home"}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Total balance</Text>
        <Text style={styles.big}>{money(net, accounts[0]?.currency ?? "CAD")}</Text>
        <Text style={styles.muted}>
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </Text>
      </View>

      {accounts.length === 0 && (
        <Pressable style={styles.button} onPress={onOpenConnect}>
          <Text style={styles.buttonText}>Connect a bank (web)</Text>
        </Pressable>
      )}

      {accounts.map((a) => (
        <View style={styles.card} key={a.id}>
          <Text style={styles.title}>{a.name}</Text>
          <Text style={styles.muted}>
            {a.type}
            {a.masked_number ? ` ****${a.masked_number}` : ""}
          </Text>
          <Text style={styles.amount}>{money(a.balance, a.currency)}</Text>
        </View>
      ))}

      <Text style={styles.h2}>Recent</Text>
      {txns.map((t) => (
        <View style={styles.row} key={t.id}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t.display_name}</Text>
            <Text style={styles.muted}>
              {t.date}
              {t.category_name ? ` · ${t.category_name}` : ""}
              {t.needs_review ? " · needs review" : ""}
            </Text>
          </View>
          <Text style={[styles.amount, Number(t.amount) < 0 && { color: colors.danger }]}>
            {money(t.amount, t.currency)}
          </Text>
        </View>
      ))}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 12 },
  h2: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 18, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  label: { color: colors.muted, fontSize: 13 },
  big: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 4 },
  title: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 2, fontSize: 13 },
  amount: { color: colors.text, fontWeight: "600", marginTop: 6 },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: colors.danger, marginTop: 12 },
});
