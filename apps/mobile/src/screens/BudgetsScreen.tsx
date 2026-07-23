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
import { CategoryIcon } from "../components/ui";
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
      <Text style={styles.lede}>Targets from your real spending history.</Text>
      <Pressable style={styles.button} onPress={propose} disabled={busy || !householdId}>
        <Text style={styles.buttonText}>Propose from history</Text>
      </Pressable>

      {budget && (
        <Text style={styles.meta}>
          {budget.name} · {budget.mode}
          {budget.period_start ? ` · ${budget.period_start} → ${budget.period_end}` : ""}
        </Text>
      )}

      {budget && (
        <View style={styles.list}>
          {budget.categories.map((c) => {
            const name = catNames[c.category_id] ?? "Category";
            const over = Number(c.remaining) < 0;
            return (
              <View style={styles.row} key={c.category_id}>
                <CategoryIcon name={name} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{name}</Text>
                  <Text style={styles.muted}>
                    {money(c.actual)} of {money(c.target)}
                  </Text>
                </View>
                <Text style={[styles.badge, over && styles.badgeWarn]}>
                  {over ? "Over" : `${money(c.remaining)} left`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {!budget && !busy && (
        <Text style={styles.muted}>No budgets yet — propose one from recent spending.</Text>
      )}

      <Text style={styles.h2}>Spending · 30 days</Text>
      <View style={styles.list}>
        {spending.map((s) => (
          <View style={styles.row} key={s.name}>
            <CategoryIcon name={s.name} />
            <Text style={[styles.title, { flex: 1 }]}>{s.name}</Text>
            <Text style={styles.amount}>{money(s.amount)}</Text>
          </View>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && !budget && <ActivityIndicator color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 14, marginTop: 2 },
  h2: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  meta: { color: colors.muted, marginBottom: 10, fontSize: 13 },
  list: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 8,
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
  amount: { color: colors.text, fontWeight: "700" },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeWarn: { color: "#9a5b00", backgroundColor: "#fff4e5" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  buttonText: { color: "#1a1814", fontWeight: "700" },
  error: { color: colors.danger, marginTop: 12 },
});
