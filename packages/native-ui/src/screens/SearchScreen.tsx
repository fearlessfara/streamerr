import { useEffect, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { searchMedia } from "@streamerr/client";
import { PosterCard } from "../PosterCard.js";
import { CatalogSkeleton } from "../Skeleton.js";
import { fieldStyles } from "../fieldStyles.js";
import { openMedia } from "../media-nav.js";
import { colors } from "../theme.js";
import { webBg } from "../webStyle.js";
import type { ScreenChromeProps } from "./types.js";

export function SearchScreen({
  layout,
  nav,
  header,
  focusMode = "touch",
  appearance = "native",
  searchInput,
  initialQuery = "",
}: ScreenChromeProps & {
  searchInput?: (props: { value: string; onChangeText: (v: string) => void }) => ReactNode;
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const web = appearance === "web";
  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchMedia(q),
    enabled: q.trim().length >= 2,
  });
  const tv = focusMode === "tv";
  const cols = layout.gridColumns ?? 2;

  return (
    <View style={[styles.page, web && { backgroundColor: webBg }]}>
      {header}
      <View
        style={[
          styles.body,
          { paddingHorizontal: layout.pageX, paddingTop: web ? (layout.headerH ?? 68) + 28 : 16 },
        ]}
      >
        {web ? <Text style={styles.heading}>Search</Text> : null}
        {searchInput ? (
          searchInput({ value: q, onChangeText: setQ })
        ) : (
          <TextInput
            style={[fieldStyles.input, web ? styles.searchWeb : styles.search]}
            value={q}
            onChangeText={setQ}
            placeholder={web ? "Titles, people, genres" : "Find movies and TV…"}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        )}
        {q.trim().length >= 2 && query.isPending && !query.data ? (
          <View style={{ marginHorizontal: -layout.pageX }}>
            <CatalogSkeleton layout={layout} cards={cols * 3} />
          </View>
        ) : null}
        {query.data ? (
          <FlatList
            data={query.data.items}
            numColumns={cols}
            key={cols}
            columnWrapperStyle={{ gap: layout.cardGap }}
            contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
            keyExtractor={(item, i) => item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${i}`}
            ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            renderItem={({ item }) => (
              <View style={{ marginBottom: 4 }}>
                <PosterCard
                  media={item}
                  layout={layout}
                  variant={web ? "hover" : "caption"}
                  showFocusRing={tv}
                  borderRadius={tv ? 4 : web ? 8 : 6}
                  onPress={() =>
                    openMedia({ navigate: (_n, params) => nav.openDetails(params) }, item)
                  }
                />
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
  heading: { color: "#fff", fontSize: 32, fontWeight: "700", letterSpacing: -0.4, marginBottom: 16 },
  search: {
    marginBottom: 16,
    backgroundColor: colors.bg2,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  searchWeb: {
    marginBottom: 20,
    maxWidth: 420,
    backgroundColor: "rgba(0,0,0,0.75)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  empty: { color: colors.muted, fontSize: 15 },
});
