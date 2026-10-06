import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { getOrCreateDeviceId, login } from "@streamerr/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () =>
      login({
        username,
        password,
        deviceId: await getOrCreateDeviceId(AsyncStorage),
        deviceName: "Streamerr Mobile",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    },
  });

  return (
    <KeyboardAvoidingView
      style={[styles.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.wordmark}>STREAMERR</Text>
      <Text style={styles.title}>Sign In</Text>
      <Text style={styles.copy}>Your media. One stream. Use your Jellyfin account.</Text>
      {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
      />
      <Button
        label={mutation.isPending ? "Signing in…" : "Sign In"}
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
      <View style={{ height: 12 }} />
      <Button
        label="Change server"
        variant="ghost"
        onPress={() => navigation.navigate("Server", { change: true })}
      />
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
    marginBottom: 12,
  },
  error: { color: colors.danger, marginBottom: 12, fontSize: 14 },
});
