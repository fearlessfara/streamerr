import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { catalogRails } from "@streamerr/client";
import { PosterCard } from "../components/PosterCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { openMedia } from "../media-nav";
import { useMobileLayout } from "../layout";
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
  const layout = useMobileLayout();
  const [search, setSearch] = useState("");
  const catalog = useQuery({
    queryKey: ["catalog", mediaType, search],
    queryFn: () => catalogRails(mediaType, { search: search.trim() || undefined }),
  });
  const rows = catalog.data?.rows ?? [];

  return (
    <View style={styles.page}>
      <ScreenHeader username={username} title={title} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.pageX,
          paddingBottom: 32,
        }}
      >
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Filter library…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {catalog.isLoading ? <ActivityIndicator color={colors.text} /> : null}
        {catalog.isError ? <Text style={styles.error}>{(catalog.error as Error).message}</Text> : null}
        {rows.map((row) => (
          <View key={row.id} style={{ marginBottom: layout.railGap }}>
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
              showsHorizontalScrollIndicator={false}
              data={row.items}
              style={{ height: layout.railListH }}
              contentContainerStyle={{ paddingRight: layout.pageX, alignItems: "flex-start" }}
              keyExtractor={(item, i) => item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${i}`}
              ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
              renderItem={({ item }) => (
                <PosterCard media={item} onPress={() => openMedia(navigation, item)} />
              )}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 18,
  },
  empty: { color: colors.muted, fontSize: 15 },
  error: { color: colors.danger, marginBottom: 16 },
});
