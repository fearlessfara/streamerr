import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { searchMedia } from "@streamerr/client";
import { Chrome } from "../components/Chrome";
import { TvTextInput } from "../components/TvTextInput";
import { PosterCard } from "../components/PosterCard";
import { openMedia } from "../media-nav";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function SearchScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchMedia(q),
    enabled: q.trim().length >= 2,
  });

  return (
    <Chrome username={username}>
      <View style={styles.page}>
        <Text style={styles.h1}>Search</Text>
        <TvTextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Find movies and TV…"
          placeholderTextColor={colors.muted}
          hasTVPreferredFocus
        />
        {query.isFetching ? <ActivityIndicator color={colors.text} /> : null}
        {query.data ? (
          <FlatList
            removeClippedSubviews={false}
            data={query.data.items}
            numColumns={6}
            keyExtractor={(item, i) => item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${i}`}
            ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            renderItem={({ item }) => (
              <PosterCard media={item} onPress={() => openMedia(navigation, item)} />
            )}
          />
        ) : (
          <Text style={styles.empty}>Type at least 2 characters.</Text>
        )}
      </View>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 48 },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800", marginBottom: 12 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    fontSize: 18,
    padding: 12,
    borderRadius: 6,
    marginBottom: 24,
    maxWidth: 520,
  },
  empty: { color: colors.muted, fontSize: 16 },
});
