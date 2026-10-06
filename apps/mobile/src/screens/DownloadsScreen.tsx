import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { cancelAcquisition, formatCacheTtlRemaining, listAcquisitions, promoteAcquisition } from "@streamerr/client";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { ListSkeleton } from "../components/Skeleton";
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
    <View style={styles.page}>
      <ScreenHeader username={username} title="Downloads" showBack />
      <View style={styles.body}>
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
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowBody}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.id}
                </Text>
                <Text style={styles.meta}>
                  {item.state}
                  {ttl ? ` · ${ttl}` : ""}
                </Text>
              </View>
              {item.state === "completed" ? (
                <Button label="Library" variant="ghost" onPress={() => promote.mutate(item.id)} />
              ) : item.state === "downloading" || item.state === "queued" ? (
                <Button label="Cancel" variant="ghost" onPress={() => cancel.mutate(item.id)} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16 },
  empty: { color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg2,
  },
  rowPressed: { backgroundColor: colors.bg1 },
  rowBody: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4, fontSize: 13 },
});
