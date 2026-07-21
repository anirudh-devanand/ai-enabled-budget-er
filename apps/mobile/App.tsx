import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ApiError, isMfaChallenge, type UserResponse } from "@ledger/api-client";
import { api } from "./src/api";
import { colors } from "./src/theme";
import { AssistantScreen } from "./src/screens/AssistantScreen";
import { BudgetsScreen } from "./src/screens/BudgetsScreen";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TransactionsScreen } from "./src/screens/TransactionsScreen";

type Tab = "home" | "txns" | "budgets" | "goals" | "assistant" | "connect";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "txns", label: "Txns" },
  { id: "budgets", label: "Budget" },
  { id: "goals", label: "Goals" },
  { id: "assistant", label: "AI" },
  { id: "connect", label: "Bank" },
];

export default function App() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [user, setUser] = useState<UserResponse | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        setChallengeToken(result.challenge_token);
      } else {
        setUser(await api.me());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    setError(null);
    setBusy(true);
    try {
      await api.register(email, password, displayName || email.split("@")[0]);
      await login();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
      setBusy(false);
    }
  }

  async function verify() {
    if (!challengeToken) return;
    setError(null);
    setBusy(true);
    try {
      await api.verifyMfa(challengeToken, code);
      setChallengeToken(null);
      setUser(await api.me());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setTab("home");
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.card}>
          <Text style={styles.title}>Ledger</Text>
          {challengeToken ? (
            <>
              <Text style={styles.sub}>Authenticator or recovery code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                placeholder="123456 or ABCD-EF01"
                placeholderTextColor={colors.muted}
              />
              <Pressable style={styles.button} onPress={verify} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sub}>{mode === "login" ? "Sign in" : "Create account"}</Text>
              {mode === "register" && (
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={colors.muted}
                />
              )}
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password (10+ chars)"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={styles.button}
                onPress={mode === "login" ? login : register}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {mode === "login" ? "Sign in" : "Register"}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setMode(mode === "login" ? "register" : "login")}
                style={{ marginTop: 14 }}
              >
                <Text style={styles.link}>
                  {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
                </Text>
              </Pressable>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Hi, {user.display_name}</Text>
        <Pressable onPress={logout}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        {tab === "home" && <HomeScreen onOpenConnect={() => setTab("connect")} />}
        {tab === "txns" && <TransactionsScreen />}
        {tab === "budgets" && <BudgetsScreen />}
        {tab === "goals" && <GoalsScreen />}
        {tab === "assistant" && <AssistantScreen />}
        {tab === "connect" && <ConnectScreen />}
      </View>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
            <Text style={[styles.tabText, tab === t.id && styles.tabActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 24 },
  app: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 4, marginBottom: 20 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: colors.danger, marginTop: 14 },
  link: { color: colors.accent, fontWeight: "500" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topTitle: { color: colors.text, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
    paddingBottom: 12,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 6 },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  tabActive: { color: colors.accent },
});
