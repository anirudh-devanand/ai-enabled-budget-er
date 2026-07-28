import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ApiError, isMfaChallenge, type UserResponse } from "@woney/api-client";
import { api } from "./src/api";
import { PasswordStrength } from "./src/components/ui";
import { colors, passwordScore } from "./src/theme";
import { AssistantScreen } from "./src/screens/AssistantScreen";
import { BudgetsScreen } from "./src/screens/BudgetsScreen";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TransactionsScreen } from "./src/screens/TransactionsScreen";

type Tab = "home" | "txns" | "budgets" | "goals" | "assistant" | "connect";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "txns", label: "Activity" },
  { id: "budgets", label: "Budget" },
  { id: "goals", label: "Goals" },
  { id: "assistant", label: "Ask" },
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
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [dataEpoch, setDataEpoch] = useState(0);
  const strength = useMemo(() => passwordScore(password), [password]);

  function kickoffSync() {
    void api.syncMineBanks().catch(() => undefined);
  }

  async function refreshBanks() {
    if (syncing) return;
    setSyncing(true);
    setSyncNote(null);
    try {
      const result = await api.syncMineBanks();
      setDataEpoch((n) => n + 1);
      if (result.failed > 0) {
        setSyncNote(`Synced ${result.synced}, ${result.failed} failed`);
      }
    } catch (err) {
      setSyncNote(err instanceof ApiError ? err.detail : "Could not sync banks");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncNote(null), 2800);
    }
  }

  async function login() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(email, password);
      if (isMfaChallenge(result)) {
        setChallengeToken(result.challenge_token);
      } else {
        kickoffSync();
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
    if (strength.score < 3) {
      setError("Choose a stronger password before continuing.");
      return;
    }
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
      kickoffSync();
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
    setDataEpoch(0);
  }

  if (!user) {
    return (
      <View style={styles.authRoot}>
        <StatusBar style="light" />
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            style={styles.authInner}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.authHeader}>
              <Text style={styles.brandMark}>Woney</Text>
              <Text style={styles.tagline}>Money, made clear.</Text>
            </View>

            <View style={styles.authCard}>
              <View style={styles.goldEdge} />
              {challengeToken ? (
                <>
                  <Text style={styles.authTitle}>Confirm it’s you</Text>
                  <Text style={styles.authSub}>Authenticator or recovery code</Text>
                  <TextInput
                    style={styles.authInput}
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    placeholder="123456 or ABCD-EF01"
                    placeholderTextColor={colors.authMuted}
                  />
                  <Pressable style={styles.goldButton} onPress={verify} disabled={busy}>
                    {busy ? (
                      <ActivityIndicator color="#1a1814" />
                    ) : (
                      <Text style={styles.goldButtonText}>Verify</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.authTitle}>
                    {mode === "login" ? "Welcome back" : "Create account"}
                  </Text>
                  <Text style={styles.authSub}>
                    {mode === "login" ? "Sign in to Woney" : "Takes about a minute"}
                  </Text>
                  {mode === "register" && (
                    <TextInput
                      style={styles.authInput}
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoComplete="name"
                      textContentType="name"
                      placeholder="Full name"
                      placeholderTextColor={colors.authMuted}
                    />
                  )}
                  <TextInput
                    style={styles.authInput}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="username"
                    textContentType="username"
                    placeholder="Email"
                    placeholderTextColor={colors.authMuted}
                  />
                  <TextInput
                    style={styles.authInput}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete={mode === "login" ? "password" : "new-password"}
                    textContentType={mode === "login" ? "password" : "newPassword"}
                    placeholder={mode === "login" ? "Password" : "Password (10+ chars)"}
                    placeholderTextColor={colors.authMuted}
                  />
                  {mode === "register" && <PasswordStrength password={password} />}
                  <Pressable
                    style={[
                      styles.goldButton,
                      mode === "register" && strength.score < 3 && styles.buttonDisabled,
                    ]}
                    onPress={mode === "login" ? login : register}
                    disabled={busy || (mode === "register" && strength.score < 3)}
                  >
                    {busy ? (
                      <ActivityIndicator color="#1a1814" />
                    ) : (
                      <Text style={styles.goldButtonText}>
                        {mode === "login" ? "Sign in" : "Create account"}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setMode(mode === "login" ? "register" : "login");
                      setError(null);
                    }}
                    style={{ marginTop: 18 }}
                  >
                    <Text style={styles.authLink}>
                      {mode === "login"
                        ? "New here? Create an account"
                        : "Have an account? Sign in"}
                    </Text>
                  </Pressable>
                </>
              )}
              {error && <Text style={styles.authError}>{error}</Text>}
            </View>

            <Text style={styles.authFoot}>Trusted sync · Honest numbers · Built for Canada</Text>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <Text style={styles.topBrand}>Woney</Text>
        <View style={styles.topActions}>
          <Pressable onPress={refreshBanks} hitSlop={8} disabled={syncing} style={{ marginRight: 16 }}>
            {syncing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.link}>Refresh</Text>
            )}
          </Pressable>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
      </View>
      {syncNote ? (
        <View style={styles.syncBanner}>
          <Text style={styles.syncBannerText}>{syncNote}</Text>
        </View>
      ) : null}
      <View style={styles.body}>
        {tab === "home" && (
          <HomeScreen
            key={`home-${dataEpoch}`}
            onOpenConnect={() => setTab("connect")}
            onOpenGoals={() => setTab("goals")}
          />
        )}
        {tab === "txns" && <TransactionsScreen key={`txns-${dataEpoch}`} />}
        {tab === "budgets" && <BudgetsScreen key={`budgets-${dataEpoch}`} />}
        {tab === "goals" && <GoalsScreen key={`goals-${dataEpoch}`} />}
        {tab === "assistant" && <AssistantScreen key={`assistant-${dataEpoch}`} />}
        {tab === "connect" && <ConnectScreen key={`connect-${dataEpoch}`} />}
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
  authRoot: {
    flex: 1,
    backgroundColor: colors.authBg,
  },
  glowTop: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(201, 168, 74, 0.18)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -60,
    right: -50,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(138, 107, 40, 0.22)",
  },
  authInner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  authHeader: { marginBottom: 28, paddingHorizontal: 4 },
  brandMark: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.goldShine,
  },
  tagline: {
    marginTop: 8,
    fontSize: 17,
    color: colors.authMuted,
    letterSpacing: -0.2,
  },
  authCard: {
    backgroundColor: colors.authCard,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.authBorder,
    padding: 24,
    overflow: "hidden",
  },
  goldEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.goldBright,
  },
  authTitle: {
    color: colors.authText,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  authSub: { color: colors.authMuted, marginTop: 6, marginBottom: 22 },
  authInput: {
    backgroundColor: "#141210",
    borderWidth: 1,
    borderColor: colors.authBorder,
    borderRadius: 14,
    color: colors.authText,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 12,
  },
  goldButton: {
    backgroundColor: colors.goldBright,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  goldButtonText: { color: "#1a1814", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.45 },
  authLink: { color: colors.goldShine, fontWeight: "600", textAlign: "center" },
  authError: {
    color: "#ffb4b4",
    marginTop: 14,
    backgroundColor: "rgba(194,59,59,0.18)",
    padding: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
  authFoot: {
    marginTop: 28,
    textAlign: "center",
    color: colors.authMuted,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  app: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  link: { color: colors.accent, fontWeight: "600" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncBanner: {
    backgroundColor: colors.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncBannerText: {
    color: colors.text,
    fontSize: 13,
  },
  topBrand: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.tabBar,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 6 },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabActive: { color: colors.accent },
});
