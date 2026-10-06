import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { attachClient, clearSession, probeServer, saveServerUrl } from "../session";
import { colors } from "../theme";
import type { Nav, RootStackParamList } from "../nav";

export function ServerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "Server">>();
  const canCancel = Boolean(route.params?.change);
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await probeServer(url);
      await clearSession();
      const origin = await saveServerUrl(url);
      attachClient(origin);
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    } catch (err) {
      setError((err as Error).message || "Could not reach Streamerr");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.wordmark}>STREAMERR</Text>
      <Text style={styles.title}>Connect to your server</Text>
      <Text style={styles.copy}>
        Enter the Streamerr address on your LAN, for example 192.168.1.10:8787
      </Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.10:8787"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        autoFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={busy ? "Connecting…" : "Continue"} onPress={() => void connect()} disabled={busy} />
      {canCancel ? (
        <>
          <View style={{ height: 12 }} />
          <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  wordmark: { color: colors.accent, fontSize: 26, fontWeight: "800", marginBottom: 20 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", marginBottom: 10 },
  copy: { color: colors.muted, fontSize: 15, marginBottom: 20, lineHeight: 21 },
  input: {
    backgroundColor: colors.bg2,
    color: colors.text,
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
    marginBottom: 14,
  },
  error: { color: colors.danger, marginBottom: 14, fontSize: 14 },
});
