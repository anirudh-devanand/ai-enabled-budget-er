import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const WEB_HINT =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://woney-web-blue.vercel.app/connect";

export function ConnectScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Link a bank</Text>
      <Text style={styles.lede}>
        Secure connection through Flinks — Woney never sees your bank password.
      </Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Open the web connect flow on this device to link your bank. Accounts and transactions sync
          to the same household, then show up here.
        </Text>
        <Pressable style={styles.button} onPress={() => Linking.openURL(WEB_HINT)}>
          <Text style={styles.buttonText}>Open web connect</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>API: {process.env.EXPO_PUBLIC_API_URL ?? "not set"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  h1: { color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  lede: { color: colors.muted, marginBottom: 14, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  body: { color: colors.text, lineHeight: 22, marginBottom: 18 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#1a1814", fontWeight: "700" },
  muted: { color: colors.muted, marginTop: 20, fontSize: 12 },
});
