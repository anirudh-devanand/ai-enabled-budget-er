import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const WEB_HINT =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://ledger-web-blue.vercel.app/connect";

export function ConnectScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Connect a bank</Text>
      <Text style={styles.body}>
        Flinks Connect runs in a secure browser iframe. Open the web app on this device to link
        Neo, EQ, or your bank, then return here — accounts and transactions sync to the same
        household.
      </Text>
      <Pressable style={styles.button} onPress={() => Linking.openURL(WEB_HINT)}>
        <Text style={styles.buttonText}>Open web connect</Text>
      </Pressable>
      <Text style={styles.muted}>API: {process.env.EXPO_PUBLIC_API_URL ?? "not set"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { color: colors.muted, lineHeight: 22, marginBottom: 20 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 20, fontSize: 12 },
});
