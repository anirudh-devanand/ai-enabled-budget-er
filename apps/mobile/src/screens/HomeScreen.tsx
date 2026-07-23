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
import { CategoryIcon } from "../components/ui";
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
      <Text style={styles.h1}>Hello</Text>
      <Text style={styles.lede}>{household?.name ?? "Your household"}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Total balance</Text>
        <Text style={styles.heroAmount}>{money(net, accounts[0]?.currency ?? "CAD")}</Text>
        <Text style={styles.heroMeta}>
          {accounts.length} account{accounts.length === 1 ? "" : "s"} · CAD
        </Text>
      </View>

      {accounts.length === 0 && (
        <Pressable style={styles.button} onPress={onOpenConnect}>
          <Text style={styles.buttonText}>Link a bank</Text>
        </Pressable>
      )}

      {accounts.map((a) => (
        <View style={styles.card} key={a.id}>
          <Text style={styles.cardLabel}>{a.type}</Text>
          <Text style={styles.title}>
            {a.name}
            {a.masked_number ? ` ····${a.masked_number}` : ""}
          </Text>
          <Text style={styles.amount}>{money(a.balance, a.currency)}</Text>
        </View>
      ))}

      {txns.length > 0 && (
        <>
          <Text style={styles.h2}>Recent activity</Text>
          <View style={styles.list}>
            {txns.map((t) => (
              <View style={styles.row} key={t.id}>
                <CategoryIcon name={t.category_name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {t.display_name}
                  </Text>
                  <Text style={styles.muted}>
                    {t.date}
                    {t.category_name ? ` · ${t.category_name}` : ""}
                    {t.needs_review ? " · needs review" : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rowAmount,
                    Number(t.amount) >= 0 && { color: colors.positive },
                  ]}
                >
                  {money(t.amount, t.currency)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 16, marginTop: 2 },
  h2: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  hero: {
    backgroundColor: colors.goldDeep,
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.goldBright,
  },
  heroLabel: { color: "rgba(245,241,232,0.82)", fontWeight: "600", fontSize: 13 },
  heroAmount: {
    color: "#f5f1e8",
    fontSize: 32,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: -0.6,
  },
  heroMeta: { color: "rgba(232,213,163,0.9)", marginTop: 8, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  cardLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: 2 },
  title: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 2, fontSize: 12 },
  amount: { color: colors.text, fontWeight: "700", marginTop: 8, fontSize: 18 },
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
  rowAmount: { color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#1a1814", fontWeight: "700" },
  error: { color: colors.danger, marginTop: 12 },
});
