import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listRequests } from "@streamerr/client";
import { ListSkeleton } from "../Skeleton.js";
import { colors } from "../theme.js";
import type { ScreenChromeProps } from "./types.js";

export function RequestsScreen({ nav, header }: Pick<ScreenChromeProps, "nav" | "header">) {
  const query = useQuery({
    queryKey: ["requests"],
    queryFn: () => listRequests({ take: 50 }),
  });

  return (
    <View style={styles.page}>
      {header}
      <View style={styles.body}>
        {query.isLoading ? <ListSkeleton rows={6} /> : null}
        {(query.data?.items ?? []).length === 0 && !query.isLoading ? (
          <Text style={styles.empty}>No requests yet.</Text>
        ) : null}
        {(query.data?.items ?? []).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              if (item.tmdbId != null) {
                nav.openDetails({ type: item.mediaType, tmdbId: item.tmdbId });
              }
            }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.title}>
              {item.title}
              {item.year ? ` (${item.year})` : ""}
            </Text>
            <Text style={styles.meta}>
              {item.mediaType} · {item.status}
              {item.mediaStatus ? ` · ${item.mediaStatus}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16 },
  empty: { color: colors.muted },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg2,
  },
  rowPressed: { backgroundColor: colors.bg1 },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4, fontSize: 13 },
});
