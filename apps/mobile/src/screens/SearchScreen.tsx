import { useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { searchMedia } from "@streamerr/client";
import { PosterCard } from "../components/PosterCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { CatalogSkeleton } from "../components/Skeleton";
import { openMedia } from "../media-nav";
import { useMobileLayout } from "../layout";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function SearchScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const layout = useMobileLayout();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchMedia(q),
    enabled: q.trim().length >= 2,
  });

  return (
    <View style={styles.page}>
      <ScreenHeader username={username} title="Search" />
      <View style={[styles.body, { paddingHorizontal: layout.pageX }]}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Find movies and TV…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {q.trim().length >= 2 && query.isPending && !query.data ? (
          <View style={{ marginHorizontal: -layout.pageX }}>
            <CatalogSkeleton cards={layout.gridColumns * 3} />
          </View>
        ) : null}
        {query.data ? (
          <FlatList
            data={query.data.items}
            numColumns={layout.gridColumns}
            key={layout.gridColumns}
            columnWrapperStyle={{ gap: layout.cardGap }}
            contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
            keyExtractor={(item, i) => item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${i}`}
            ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 4 }}>
                <PosterCard media={item} onPress={() => openMedia(navigation, item)} />
              </View>
            )}
          />
        ) : q.trim().length < 2 ? (
          <Text style={styles.empty}>Type at least 2 characters.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  empty: { color: colors.muted, fontSize: 15 },
});
