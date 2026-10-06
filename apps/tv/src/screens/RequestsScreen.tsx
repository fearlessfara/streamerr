import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { listRequests } from "@streamerr/client";
import { Chrome } from "../components/Chrome";
import { isTvFocused } from "../focus";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function RequestsScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const query = useQuery({
    queryKey: ["requests"],
    queryFn: () => listRequests({ take: 50 }),
  });

  return (
    <Chrome username={username}>
      <View style={styles.page}>
        <Text style={styles.h1}>Requests</Text>
        {query.isLoading ? <ActivityIndicator color={colors.text} /> : null}
        {(query.data?.items ?? []).length === 0 && !query.isLoading ? (
          <Text style={styles.empty}>No requests yet.</Text>
        ) : null}
        {(query.data?.items ?? []).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              if (item.tmdbId != null) {
                navigation.navigate("Details", { type: item.mediaType, tmdbId: item.tmdbId });
              }
            }}
            style={(s) => [styles.row, isTvFocused(s) && styles.rowFocused]}
          >
            <View>
              <Text style={styles.title}>
                {item.title}
                {item.year ? ` (${item.year})` : ""}
              </Text>
              <Text style={styles.meta}>
                {item.mediaType} · {item.status}
                {item.mediaStatus ? ` · ${item.mediaStatus}` : ""}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 48 },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800", marginBottom: 16 },
  empty: { color: colors.muted },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 4 },
  rowFocused: { backgroundColor: colors.bg2 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4 },
});
