import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { cancelAcquisition, formatCacheTtlRemaining, listAcquisitions, promoteAcquisition } from "@streamerr/client";
import { Chrome } from "../components/Chrome";
import { Focusable } from "../components/Focusable";
import { ListSkeleton } from "../components/Skeleton";
import { isTvFocused } from "../focus";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function DownloadsScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["acquisitions"],
    queryFn: () => listAcquisitions(),
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const active = items.some((i) => ["queued", "downloading", "playable"].includes(i.state));
      return active ? 2000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAcquisition(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["acquisitions"] }),
  });
  const promote = useMutation({
    mutationFn: (id: string) => promoteAcquisition(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["acquisitions"] }),
  });

  return (
    <Chrome username={username}>
      <View style={styles.page}>
        <Text style={styles.h1}>Downloads</Text>
        {query.isLoading ? <ListSkeleton rows={5} /> : null}
        {(query.data?.items ?? []).length === 0 && !query.isLoading ? (
          <Text style={styles.empty}>No downloads yet.</Text>
        ) : null}
        {(query.data?.items ?? []).map((item) => {
          const ttl = formatCacheTtlRemaining(item.cacheExpiresAt);
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                const id = item.identity;
                if (id.tmdbId && (id.mediaType === "movie" || id.mediaType === "tv" || id.mediaType === "episode")) {
                  navigation.navigate("Details", {
                    type: id.mediaType === "movie" ? "movie" : "tv",
                    tmdbId: id.tmdbId,
                  });
                } else if (id.jellyfinItemId) {
                  navigation.navigate("Details", { jellyfinItemId: id.jellyfinItemId });
                }
              }}
              style={(s) => [styles.row, isTvFocused(s) && styles.rowFocused]}
            >
              <View style={styles.body}>
                <Text style={styles.title}>{item.id}</Text>
                <Text style={styles.meta}>
                  {item.state}
                  {ttl ? ` · ${ttl}` : ""}
                </Text>
              </View>
              {item.state === "completed" ? (
                <Focusable label="Library" onPress={() => promote.mutate(item.id)} />
              ) : item.state === "downloading" || item.state === "queued" ? (
                <Focusable label="Cancel" onPress={() => cancel.mutate(item.id)} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 48 },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800", marginBottom: 16 },
  empty: { color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderRadius: 4,
  },
  rowFocused: { backgroundColor: colors.bg2 },
  body: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4 },
});
