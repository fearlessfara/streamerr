import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { Media } from "@streamerr/shared";
import { actionLabel, canPlayMedia, formatRuntime, home, resolvePlaybackForPlay } from "@streamerr/client";
import { Artwork } from "../artwork";
import { Chrome } from "../components/Chrome";
import { Focusable } from "../components/Focusable";
import { PosterCard } from "../components/PosterCard";
import { openMedia } from "../media-nav";
import { useTvLayout } from "../layout";
import { colors } from "../theme";
import type { Nav } from "../nav";

export function HomeScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const layout = useTvLayout();
  const homeQuery = useQuery({ queryKey: ["home"], queryFn: () => home() });
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const railTops = useRef<Record<string, number>>({});

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
        style={styles.body}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {homeQuery.isLoading ? <ActivityIndicator color={colors.text} /> : null}
        {featured ? (
          <View style={[styles.hero, { height: layout.heroH, marginBottom: layout.railGap }]}>
            <Artwork url={featured.metadata.backdropUrl} maxWidth={1280} style={styles.heroImage} />
            <View style={[styles.heroCopy, { paddingHorizontal: layout.pageX }]}>
              <Text style={[styles.heroTitle, { fontSize: Math.round(layout.heroH * 0.12) }]}>
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
                  <Focusable
                    label={actionLabel(featured).replace(/^▶\s*/, "")}
                    onPress={() => playMedia.mutate(featured)}
                    hasTVPreferredFocus
                  />
                ) : null}
                <Focusable label="Details" onPress={() => openMedia(navigation, featured)} />
              </View>
            </View>
          </View>
        ) : null}
        {(homeQuery.data?.rows ?? []).map((row, rowIndex) => (
          <View
            key={row.id}
            onLayout={(e) => {
              railTops.current[row.id] = e.nativeEvent.layout.y;
            }}
            style={{ paddingLeft: layout.pageX, marginBottom: layout.railGap }}
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
              renderItem={({ item, index }) => (
                <PosterCard
                  media={item}
                  hasTVPreferredFocus={rowIndex === 0 && index === 0 && !featured}
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
  body: { flex: 1 },
  content: { paddingBottom: 48 },
  hero: { justifyContent: "flex-end" },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 },
  heroCopy: { paddingBottom: 16 },
  heroTitle: { color: colors.text, fontWeight: "800" },
  heroMeta: { color: colors.muted, marginTop: 6, fontSize: 15 },
  buffer: { color: colors.text, marginTop: 8 },
  heroActions: { flexDirection: "row", gap: 12, marginTop: 12 },
});
