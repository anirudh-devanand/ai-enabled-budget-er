import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { GoalResponse, PlanResponse } from "@woney/api-client";
import { ApiError } from "@woney/api-client";
import { api } from "../api";
import { colors, money } from "../theme";

export function GoalsScreen() {
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [name, setName] = useState("Emergency fund");
  const [target, setTarget] = useState("5000");
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
        setGoals([]);
        return;
      }
      setGoals(await api.listGoals(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!householdId) return;
    setBusy(true);
    try {
      await api.createGoal(householdId, name, target);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not create goal");
      setBusy(false);
    }
  }

  async function build(goalId: string) {
    setBusy(true);
    try {
      setPlan(await api.buildPlan(goalId));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not build plan");
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
      <Text style={styles.h1}>Goals</Text>
      <Text style={styles.lede}>Set a target. Plan from real cash flow.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>New goal</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Goal name"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={styles.input}
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
          placeholder="Target amount"
          placeholderTextColor={colors.muted}
        />
        <Pressable style={styles.button} onPress={create} disabled={busy || !householdId}>
          <Text style={styles.buttonText}>Add goal</Text>
        </Pressable>
      </View>

      {goals.map((g) => {
        const pct = Math.min(
          100,
          (Number(g.current_amount) / Math.max(Number(g.target_amount), 1)) * 100,
        );
        return (
          <View style={styles.card} key={g.id}>
            <Text style={styles.title}>{g.name}</Text>
            <Text style={styles.muted}>
              {money(g.current_amount)} / {money(g.target_amount)}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
            <Pressable style={styles.secondary} onPress={() => build(g.id)}>
              <Text style={styles.secondaryText}>Build plan</Text>
            </Pressable>
          </View>
        );
      })}

      {plan && (
        <View style={styles.card}>
          <Text style={styles.title}>Plan</Text>
          <Text style={styles.muted}>{plan.summary}</Text>
          <Text style={styles.muted}>
            Monthly needed: {money(plan.monthly_surplus_needed)}
          </Text>
          {plan.items.map((item) => (
            <Text key={item.id} style={styles.item}>
              · {item.action}: {money(item.amount)} — {item.rationale}
            </Text>
          ))}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {busy && goals.length === 0 && <ActivityIndicator color={colors.accent} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 14, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: colors.muted, fontWeight: "600", marginBottom: 10, fontSize: 13 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  title: { color: colors.text, fontWeight: "700", fontSize: 16 },
  muted: { color: colors.muted, marginTop: 4, fontSize: 13 },
  item: { color: colors.text, marginTop: 6, fontSize: 13 },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginTop: 12,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 999 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  secondary: {
    marginTop: 14,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buttonText: { color: "#1a1814", fontWeight: "700" },
  secondaryText: { color: colors.text, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 12 },
});
