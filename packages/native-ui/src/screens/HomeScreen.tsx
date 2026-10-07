import { useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { actionLabel, canPlayMedia, formatRuntime, home } from "@streamerr/client";
import { Artwork } from "../Artwork.js";
import { Billboard } from "../Billboard.js";
import { Button } from "../Button.js";
import { Focusable } from "../Focusable.js";
import { MediaRail } from "../MediaRail.js";
import { HomeSkeleton } from "../Skeleton.js";
import { openMedia } from "../media-nav.js";
import { colors } from "../theme.js";
import { usePlayMedia } from "../hooks/usePlayMedia.js";
import { webBg } from "../webStyle.js";
import type { ScreenChromeProps } from "./types.js";

export function HomeScreen({
  layout,
  nav,
  header,
  focusMode = "touch",
  appearance = "native",
  onScrollOffset,
}: ScreenChromeProps) {
  const homeQuery = useQuery({ queryKey: ["home"], queryFn: () => home() });
  const { playMedia, bufferStatus } = usePlayMedia(nav);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const railTops = useRef<Record<string, number>>({});
  const tv = focusMode === "tv";
  const web = appearance === "web";

  const featured = useMemo(() => {
    for (const row of homeQuery.data?.rows ?? []) {
      if (row.items[0]) return row.items[0];
    }
    return null;
  }, [homeQuery.data]);

  const viewportH = (layout.height ?? 0) - (layout.headerH ?? 0);
  const railBlockH = (layout.railTitleH ?? 0) + (layout.railListH ?? 0);

  function ensureRailVisible(rowId: string) {
    if (!tv) return;
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
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    onScrollOffset?.(y);
  }

  const open = (media: Parameters<typeof openMedia>[1]) => openMedia(navAsMediaNav(nav), media);
  const Cta = tv ? Focusable : Button;

  return (
    <View style={[styles.page, web && { backgroundColor: webBg }]}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={[styles.body, web ? styles.bodyWeb : null]}
        contentContainerStyle={[styles.content, web ? styles.contentWeb : null]}
        onScroll={tv || web ? onScroll : undefined}
        scrollEventThrottle={tv || web ? 16 : undefined}
      >
        {homeQuery.isLoading ? <HomeSkeleton layout={layout} rails={2} cards={4} /> : null}
        {web && featured ? (
          <Billboard
            media={featured}
            layout={layout}
            variant="bleed"
            playLabel={
              playMedia.isPending ? bufferStatus || "Resolving…" : actionLabel(featured).replace(/^▶\s*/, "")
            }
            bufferStatus={bufferStatus}
            onPlay={() => playMedia.mutate(featured)}
            onInfo={() => open(featured)}
          />
        ) : null}
        {!web && featured ? (
          <View style={[styles.hero, { height: layout.heroH, marginBottom: layout.railGap }]}>
            <Artwork url={featured.metadata.backdropUrl} maxWidth={1280} style={styles.heroImage} />
            <View style={[styles.heroCopy, { paddingHorizontal: layout.pageX }]}>
              <Text
                style={[
                  styles.heroTitle,
                  tv ? { fontSize: Math.round(layout.heroH * 0.12) } : { fontSize: 26 },
                ]}
                numberOfLines={2}
              >
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
                  <Cta
                    label={actionLabel(featured).replace(/^▶\s*/, "")}
                    onPress={() => playMedia.mutate(featured)}
                    hasTVPreferredFocus={tv || undefined}
                  />
                ) : null}
                {tv ? (
                  <Focusable label="Details" onPress={() => open(featured)} />
                ) : (
                  <Button label="Details" variant="ghost" onPress={() => open(featured)} />
                )}
              </View>
            </View>
          </View>
        ) : null}
        {(homeQuery.data?.rows ?? []).map((row, rowIndex) => (
          <MediaRail
            key={row.id}
            title={row.title}
            items={row.items}
            layout={layout}
            appearance={appearance}
            showFocusRing={tv}
            railIndex={rowIndex}
            onOpen={open}
            onPlay={(media) => playMedia.mutate(media)}
            onFocusCard={tv ? () => ensureRailVisible(row.id) : undefined}
            preferFirst={tv && rowIndex === 0 && !featured}
            onLayout={
              tv
                ? (e) => {
                    railTops.current[row.id] = e.nativeEvent.layout.y;
                  }
                : undefined
            }
          />
        ))}
        {!homeQuery.isLoading && !(homeQuery.data?.rows ?? []).length ? (
          <Text style={[styles.empty, { paddingHorizontal: layout.pageX }]}>Nothing on Home yet.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function navAsMediaNav(nav: ScreenChromeProps["nav"]) {
  return { navigate: (_: "Details", params: Parameters<typeof nav.openDetails>[0]) => nav.openDetails(params) };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  bodyWeb: { overflow: "visible" },
  content: { paddingBottom: 48 },
  contentWeb: { overflow: "visible" },
  empty: { color: colors.muted, fontSize: 15 },
  hero: { justifyContent: "flex-end" },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 },
  heroCopy: { paddingBottom: 16 },
  heroTitle: { color: colors.text, fontWeight: "800" },
  heroMeta: { color: colors.muted, marginTop: 6, fontSize: 14 },
  buffer: { color: colors.text, marginTop: 8 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
});
