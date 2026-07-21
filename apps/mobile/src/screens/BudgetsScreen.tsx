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
import type { BudgetDetailResponse, NamedAmount } from "@ledger/api-client";
import { ApiError } from "@ledger/api-client";
import { api } from "../api";
import { colors, money } from "../theme";

export function BudgetsScreen() {
  const [budget, setBudget] = useState<BudgetDetailResponse | null>(null);
  const [spending, setSpending] = useState<NamedAmount[]>([]);
  const [catNames, setCatNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const households = await api.listHouseholds();
      const id = households[0]?.id ?? null;
      setHouseholdId(id);
      if (!id) {
        setBudget(null);
        return;
      }
      const [list, cats, allCats] = await Promise.all([
        api.listBudgets(id),
        api.getSpendingByCategory(id, 30),
        api.listCategories(),
      ]);
      setSpending(cats);
      setCatNames(Object.fromEntries(allCats.map((c) => [c.id, c.name])));
      if (list[0]) setBudget(await api.getBudget(list[0].id));
      else setBudget(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function propose() {
    if (!householdId) return;
    setBusy(true);
    try {
      const created = await api.createBudget(householdId, {
        propose: true,
        name: "Monthly budget",
      });
      setBudget(await api.getBudget(created.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create budget");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.accent} />}
    >
      <Text style={styles.h1}>Budgets</Text>
      <Pressable style={styles.button} onPress={propose} disabled={busy || !householdId}>
        <Text style={styles.buttonText}>Propose from history</Text>
      </Pressable>

      {budget && (
        <Text style={styles.muted}>
          {budget.name} · {budget.mode}
          {budget.period_start ? ` · ${budget.period_start} → ${budget.period_end}` : ""}
        </Text>
      )}

      {budget?.categories.map((c) => (
        <View style={styles.card} key={c.category_id}>
          <Text style={styles.title}>{catNames[c.category_id] ?? "Category"}</Text>
          <Text style={styles.muted}>
            Target {money(c.target)} · Actual {money(c.actual)} · Left {money(c.remaining)}
          </Text>
        </View>
      ))}

      {!budget && !busy && (
        <Text style={styles.muted}>No budgets yet — propose one from recent spending.</Text>
      )}

      <Text style={styles.h2}>Spending (30d)</Text>
      {spending.map((s) => (
        <View style={styles.row} key={s.name}>
          <Text style={styles.title}>{s.name}</Text>
          <Text style={styles.amount}>{money(s.amount)}</Text>
        </View>
      ))}
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && !budget && <ActivityIndicator color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 12 },
  h2: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 18, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  title: { color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 4, marginBottom: 10, fontSize: 13 },
  amount: { color: colors.text, fontWeight: "600" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: colors.danger, marginTop: 12 },
});
