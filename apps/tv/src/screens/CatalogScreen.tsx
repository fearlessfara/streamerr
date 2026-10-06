import { useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { catalogRails } from "@streamerr/client";
import { Chrome } from "../components/Chrome";
import { TvTextInput } from "../components/TvTextInput";
import { PosterCard } from "../components/PosterCard";
import { RailSkeleton } from "../components/Skeleton";
import { openMedia } from "../media-nav";
import { useTvLayout } from "../layout";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function CatalogScreen({
  username,
  mediaType,
  title,
}: {
  username: string;
  mediaType: "movie" | "tv";
  title: string;
}) {
  const navigation = useNavigation<Nav>();
  const layout = useTvLayout();
  const [search, setSearch] = useState("");
  const catalog = useQuery({
    queryKey: ["catalog", mediaType, search],
    queryFn: () => catalogRails(mediaType, { search: search.trim() || undefined }),
  });
  const rows = catalog.data?.rows ?? [];
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const railTops = useRef<Record<string, number>>({});
  const viewportH = layout.height - layout.headerH;
  const railBlockH = layout.railTitleH + layout.railListH;

  function ensureRailVisible(rowId: string) {
    const top = railTops.current[rowId];
    if (top == null) return;
    const bottom = top + railBlockH + 12;
    const viewTop = scrollY.current;
    const viewBottom = viewTop + viewportH;
    if (bottom > viewBottom) {
      scrollRef.current?.scrollTo({ y: bottom - viewportH + 8, animated: true });
    } else if (top < viewTop) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top - 8), animated: true });
    }
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }

  return (
    <Chrome username={username}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: layout.pageX,
          paddingBottom: 48,
        }}
      >
        <Text style={styles.h1}>{title}</Text>
        <TvTextInput
          style={[styles.search, { maxWidth: Math.min(420, layout.width * 0.35) }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Filter library…"
          placeholderTextColor={colors.muted}
        />
        {catalog.isLoading ? (
          <View style={{ marginHorizontal: -layout.pageX }}>
            <RailSkeleton rails={2} cards={6} />
          </View>
        ) : null}
        {catalog.isError ? <Text style={styles.error}>{(catalog.error as Error).message}</Text> : null}
        {rows.map((row, rowIndex) => (
          <View
            key={row.id}
            onLayout={(e) => {
              railTops.current[row.id] = e.nativeEvent.layout.y;
            }}
            style={{ marginBottom: layout.railGap }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: layout.railTitleSize,
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              {row.title}
            </Text>
            <FlatList
              horizontal
              removeClippedSubviews={false}
              data={row.items}
              style={{ height: layout.railListH }}
              contentContainerStyle={{ paddingRight: layout.pageX, alignItems: "flex-start" }}
              keyExtractor={(item, i) => item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${i}`}
              ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
              renderItem={({ item, index }) => (
                <PosterCard
                  media={item}
                  hasTVPreferredFocus={rowIndex === 0 && index === 0}
                  onFocusCard={() => ensureRailVisible(row.id)}
                  onPress={() => openMedia(navigation, item)}
                />
              )}
            />
          </View>
        ))}
      </ScrollView>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 10 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    fontSize: 16,
    padding: 10,
    borderRadius: 6,
    marginBottom: 20,
  },
  empty: { color: colors.muted, fontSize: 15 },
  error: { color: colors.danger, marginBottom: 16 },
});
