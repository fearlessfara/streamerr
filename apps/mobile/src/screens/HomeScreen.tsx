import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { Media } from "@streamerr/shared";
import { actionLabel, canPlayMedia, formatRuntime, home, resolvePlaybackForPlay } from "@streamerr/client";
import { Artwork } from "../artwork";
import { Button } from "../components/Button";
import { PosterCard } from "../components/PosterCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { HomeSkeleton } from "../components/Skeleton";
import { openMedia } from "../media-nav";
import { useMobileLayout } from "../layout";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function HomeScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const layout = useMobileLayout();
  const homeQuery = useQuery({ queryKey: ["home"], queryFn: () => home() });
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);

  const featured = useMemo(() => {
    for (const row of homeQuery.data?.rows ?? []) {
      if (row.items[0]) return row.items[0];
    }
    return null;
  }, [homeQuery.data]);

  const playMedia = useMutation({
    mutationFn: (media: Media) =>
      resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            setBufferStatus(`Buffering… ${Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))}%`);
          } else {
            setBufferStatus(`Buffering… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      }).then((source) => ({ source, media })),
    onSuccess: ({ source, media }) => {
      setBufferStatus(null);
      navigation.navigate("Player", {
        source,
        title: media.metadata.title,
        identity: media.identity,
      });
    },
    onError: (_err, media) => {
      setBufferStatus(null);
      openMedia(navigation, media);
    },
  });

  return (
    <View style={styles.page}>
      <ScreenHeader username={username} />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {homeQuery.isLoading ? <HomeSkeleton /> : null}
        {featured ? (
          <View style={[styles.hero, { height: layout.heroH, marginBottom: layout.railGap }]}>
            <Artwork url={featured.metadata.backdropUrl} maxWidth={1280} style={styles.heroImage} />
            <View style={[styles.heroCopy, { paddingHorizontal: layout.pageX }]}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {featured.metadata.title}
              </Text>
              <Text style={styles.heroMeta}>
                {[featured.metadata.year, formatRuntime(featured.metadata.runtimeMinutes)]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
              {bufferStatus ? <Text style={styles.buffer}>{bufferStatus}</Text> : null}
              <View style={styles.heroActions}>
                {canPlayMedia(featured) ? (
                  <Button
                    label={actionLabel(featured).replace(/^▶\s*/, "")}
                    onPress={() => playMedia.mutate(featured)}
                  />
                ) : null}
                <Button label="Details" variant="ghost" onPress={() => openMedia(navigation, featured)} />
              </View>
            </View>
          </View>
        ) : null}
        {(homeQuery.data?.rows ?? []).map((row) => (
          <View key={row.id} style={{ paddingLeft: layout.pageX, marginBottom: layout.railGap }}>
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
              renderItem={({ item }) => (
                <PosterCard media={item} onPress={() => openMedia(navigation, item)} />
              )}
            />
          </View>
        ))}
        {!homeQuery.isLoading && !(homeQuery.data?.rows ?? []).length ? (
          <Pressable style={{ paddingHorizontal: layout.pageX }}>
            <Text style={styles.empty}>Nothing on Home yet.</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  content: { paddingBottom: 32 },
  hero: { justifyContent: "flex-end" },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 },
  heroCopy: { paddingBottom: 16 },
  heroTitle: { color: colors.text, fontWeight: "800", fontSize: 26 },
  heroMeta: { color: colors.muted, marginTop: 6, fontSize: 14 },
  buffer: { color: colors.text, marginTop: 8 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  empty: { color: colors.muted, fontSize: 15 },
});
