import { StyleSheet, Text, View } from "react-native";
import type { Media } from "@streamerr/shared";
import { canPlayMedia, formatRuntime } from "@streamerr/client";
import { Artwork } from "./Artwork.js";
import { PillButton } from "./Button.js";
import type { NativeLayout } from "./layout.js";
import { textShadowStyle, webBg, webGradient } from "./webStyle.js";

function metaLine(media: Media): string {
  const kind =
    media.identity.mediaType === "tv" ? "Series" : media.identity.mediaType === "movie" ? "Movie" : null;
  return [kind, media.metadata.genres?.[0], media.metadata.year ? String(media.metadata.year) : null, formatRuntime(media.metadata.runtimeMinutes)]
    .filter(Boolean)
    .join("   ·   ");
}

export function Billboard({
  media,
  layout,
  variant,
  playLabel,
  onPlay,
  onInfo,
  bufferStatus,
}: {
  media: Media;
  layout: NativeLayout;
  /** Full-bleed home hero, or the rounded panel used on Movies / Series. */
  variant: "bleed" | "inset";
  playLabel: string;
  onPlay: () => void;
  onInfo: () => void;
  bufferStatus?: string | null;
}) {
  const art = media.metadata.backdropUrl || media.metadata.posterUrl;
  const inset = variant === "inset";
  const playable = canPlayMedia(media);

  return (
    <View
      style={[
        styles.frame,
        inset
          ? {
              marginHorizontal: layout.pageX,
              height: Math.round(layout.heroH * 0.92),
              borderRadius: 16,
              marginBottom: 22,
            }
          : { height: layout.heroH, marginBottom: -56 },
      ]}
    >
      <Artwork url={art} maxWidth={1600} style={styles.image} />
      <View
        style={[
          styles.shade,
          webGradient("linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 28%, transparent 46%, rgba(0,0,0,0.55) 72%, #000 100%)"),
        ]}
      />
      <View
        style={[
          styles.shade,
          webGradient("linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 42%, transparent 68%)"),
        ]}
      />
      <View style={[styles.copy, { paddingHorizontal: inset ? 36 : layout.pageX }]}>
        <Text style={[styles.title, inset ? styles.titleInset : null]} numberOfLines={2}>
          {media.metadata.title}
        </Text>
        <Text style={styles.meta}>{metaLine(media)}</Text>
        {media.metadata.overview ? (
          <Text style={styles.overview} numberOfLines={3}>
            {media.metadata.overview}
          </Text>
        ) : null}
        {bufferStatus ? <Text style={styles.buffer}>{bufferStatus}</Text> : null}
        <View style={styles.actions}>
          <PillButton
            icon={playable ? "play" : undefined}
            label={playLabel}
            tone="light"
            onPress={playable ? onPlay : onInfo}
          />
          <PillButton icon="info" label="More Info" tone="glass" onPress={onInfo} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    justifyContent: "flex-end",
    overflow: "hidden",
    backgroundColor: webBg,
  },
  image: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" },
  copy: { paddingBottom: 64, maxWidth: 640, zIndex: 2 },
  title: {
    color: "#fff",
    fontSize: 52,
    lineHeight: 54,
    fontWeight: "800",
    letterSpacing: -0.8,
    ...textShadowStyle(0, 2, 12, "rgba(0,0,0,0.65)"),
  },
  titleInset: { fontSize: 42, lineHeight: 44 },
  meta: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 12 },
  overview: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 520,
    ...textShadowStyle(0, 1, 8, "rgba(0,0,0,0.8)"),
  },
  buffer: { color: "#fff", marginTop: 8, fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
});
