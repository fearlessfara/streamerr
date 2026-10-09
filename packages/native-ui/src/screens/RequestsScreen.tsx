import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listRequests } from "@streamerr/client";
import { isTvFocused, tvFocusHighlight } from "../focus.js";
import { ListSkeleton } from "../Skeleton.js";
import { colors } from "../theme.js";
import { webBg } from "../webStyle.js";
import type { ScreenChromeProps } from "./types.js";

export function RequestsScreen({
  nav,
  header,
  focusMode = "touch",
}: Pick<ScreenChromeProps, "nav" | "header" | "focusMode">) {
  const tv = focusMode === "tv";
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
            style={(state) => [
              styles.row,
              state.pressed && styles.rowPressed,
              tv && isTvFocused(state) && tvFocusHighlight,
            ]}
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
  page: { flex: 1, backgroundColor: webBg },
  body: { flex: 1, paddingHorizontal: 16 },
  empty: { color: colors.muted },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg2,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 8,
  },
  rowPressed: { backgroundColor: colors.bg1 },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4, fontSize: 13 },
});
