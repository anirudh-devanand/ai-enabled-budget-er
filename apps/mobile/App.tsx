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

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [user, setUser] = useState<UserResponse | null>(null);
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
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.title}>Ledger</Text>
        {user ? (
          <>
            <Text style={styles.sub}>Signed in as {user.display_name}</Text>
            <Pressable style={styles.button} onPress={logout}>
              <Text style={styles.buttonText}>Sign out</Text>
            </Pressable>
          </>
        ) : challengeToken ? (
          <>
            <Text style={styles.sub}>Enter your authenticator code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor="#666"
            />
            <Pressable style={styles.button} onPress={verify} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sub}>Sign in to continue</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#666"
            />
            <Pressable style={styles.button} onPress={login} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e1116", justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: "#171b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a3038",
    padding: 28,
  },
  title: { color: "#e8eaed", fontSize: 24, fontWeight: "700" },
  sub: { color: "#9aa3ad", marginTop: 4, marginBottom: 20 },
  input: {
    backgroundColor: "#0e1116",
    borderWidth: 1,
    borderColor: "#2a3038",
    borderRadius: 8,
    color: "#e8eaed",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#4f8cff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#ff6b6b", marginTop: 14 },
});
