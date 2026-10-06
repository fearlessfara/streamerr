import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Media } from "@streamerr/shared";
import { actionLabel, canPlayMedia } from "@streamerr/client";
import { Artwork } from "../artwork";
import { DownloadIcon, PlayIcon } from "../icons";
import { useMobileLayout } from "../layout";
import { colors } from "../theme";

function cornerKind(media: Media): "play" | "download" | null {
  if (canPlayMedia(media)) return "play";
  if (media.preferredAction === "REQUEST") return "download";
  const seerr = media.availability.find((a) => a.provider === "seerr");
  if (
    seerr?.mediaStatus === "PENDING" ||
    seerr?.mediaStatus === "PROCESSING" ||
    seerr?.requestStatus === "PENDING" ||
    seerr?.requestStatus === "APPROVED"
  ) {
    return "download";
  }
  return null;
}

export function PosterCard({ media, onPress }: { media: Media; onPress: () => void }) {
  const layout = useMobileLayout();
  const backdrop = media.metadata.backdropUrl;
  const poster = media.metadata.posterUrl;
  const [source, setSource] = useState<"wide" | "poster" | "none">("wide");
  const art = source === "none" ? undefined : source === "poster" ? poster : backdrop || poster;
  const corner = cornerKind(media);
  const w = layout.cardWidth;
  const h = layout.posterH;

  return (
    <View style={{ width: w, marginRight: layout.cardGap }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          {
            width: w,
            height: h,
            borderRadius: 6,
            backgroundColor: colors.bg2,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          },
          pressed && { opacity: 0.9 },
        ]}
      >
        {art ? (
          <Artwork
            url={art}
            maxWidth={layout.artMaxWidth}
            style={{ width: w, height: h }}
            onError={() => {
              if (source !== "poster" && poster && poster !== art) setSource("poster");
              else setSource("none");
            }}
          />
        ) : (
          <Text style={[styles.placeholderText, { fontSize: layout.titleSize }]} numberOfLines={3}>
            {media.metadata.title}
          </Text>
        )}
        {corner ? (
          <View style={styles.badge} pointerEvents="none">
            {corner === "play" ? (
              <PlayIcon color={colors.text} size={12} />
            ) : (
              <DownloadIcon color={colors.text} size={12} />
            )}
          </View>
        ) : null}
      </Pressable>
      <Text
        style={{
          color: colors.text,
          marginTop: layout.cardTextGap,
          fontSize: layout.titleSize,
          lineHeight: layout.titleLine,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {media.metadata.title}
      </Text>
      <Text
        style={{
          color: colors.muted,
          marginTop: 1,
          fontSize: layout.metaSize,
          lineHeight: layout.metaLine,
        }}
        numberOfLines={1}
      >
        {actionLabel(media)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholderText: {
    color: colors.text,
    textAlign: "center",
    padding: 8,
  },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    zIndex: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
});
