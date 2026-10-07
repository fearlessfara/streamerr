import { useRef, useState } from "react";
import { FlatList, Text, View, type LayoutChangeEvent } from "react-native";
import type { Media } from "@streamerr/shared";
import { canPlayMedia } from "@streamerr/client";
import { HScroll } from "./HScroll.js";
import { PosterCard } from "./PosterCard.js";
import type { NativeLayout } from "./layout.js";
import { colors } from "./theme.js";
import type { Appearance } from "./screens/types.js";
import { HOVER_ROOM } from "./webStyle.js";

function cardKey(item: Media, index: number) {
  return item.identity.jellyfinItemId ?? `${item.identity.tmdbId}-${index}`;
}

export function MediaRail({
  title,
  items,
  layout,
  appearance = "native",
  showFocusRing = false,
  railIndex = 0,
  onOpen,
  onPlay,
  onFocusCard,
  preferFirst = false,
  onLayout,
}: {
  title: string;
  items: Media[];
  layout: NativeLayout;
  appearance?: Appearance;
  showFocusRing?: boolean;
  /** Earlier rails sit above later ones so hover panels are not covered. */
  railIndex?: number;
  onOpen: (media: Media) => void;
  onPlay?: (media: Media) => void;
  onFocusCard?: () => void;
  preferFirst?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const web = appearance === "web";
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function hoverIn(key: string) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHoveredKey(key);
  }

  function hoverOut(key: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Short delay so moving within the enlarged card does not flicker;
    // entering another card cancels this via hoverIn.
    closeTimer.current = setTimeout(() => {
      setHoveredKey((cur) => (cur === key ? null : cur));
      closeTimer.current = null;
    }, 80);
  }

  const hot = hoveredKey != null;

  return (
    <View
      onLayout={onLayout}
      {...(web ? ({ dataSet: { seRail: hot ? "hot" : "1" } } as object) : null)}
      style={{
        position: "relative",
        paddingLeft: layout.pageX,
        // Pull the next rail up under this one; hover panel lives in HOVER_ROOM.
        marginBottom: web ? layout.railGap - HOVER_ROOM : layout.railGap,
        zIndex: hot ? 1000 : Math.max(1, 200 - railIndex),
        overflow: "visible",
      }}
    >
      <Text
        style={{
          color: web ? "#fff" : colors.text,
          fontSize: web ? 18 : layout.railTitleSize,
          fontWeight: web ? "500" : "700",
          marginBottom: web ? 4 : 8,
        }}
      >
        {title}
      </Text>
      {web ? (
        <View
          {...({ dataSet: { seRailTrack: "1" } } as object)}
          pointerEvents="box-none"
          style={{
            height: layout.posterH + HOVER_ROOM,
            overflow: "visible",
          }}
        >
          <HScroll
            // Tall enough to paint hover panels, but empty HOVER_ROOM must not
            // steal hits from the next rail (pointer-events handled in CSS).
            style={{ height: layout.posterH + HOVER_ROOM }}
            contentContainerStyle={{
              paddingRight: layout.pageX,
              paddingTop: 8,
              paddingBottom: HOVER_ROOM - 8,
              alignItems: "flex-start",
              minHeight: layout.posterH + HOVER_ROOM,
            }}
          >
            {items.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 15 }}>Nothing here yet.</Text>
            ) : (
              items.map((item, index) => {
                const key = cardKey(item, index);
                return (
                  <PosterCard
                    key={key}
                    media={item}
                    layout={layout}
                    variant="hover"
                    borderRadius={8}
                    expanded={hoveredKey === key}
                    onHoverChange={(on) => (on ? hoverIn(key) : hoverOut(key))}
                    onPress={() => onOpen(item)}
                    onPlay={
                      onPlay && canPlayMedia(item) && item.identity.mediaType !== "tv"
                        ? () => onPlay(item)
                        : undefined
                    }
                  />
                );
              })
            )}
          </HScroll>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={items}
          style={{ height: layout.railListH }}
          contentContainerStyle={{ paddingRight: layout.pageX, alignItems: "flex-start" }}
          keyExtractor={(item, i) => cardKey(item, i)}
          ListEmptyComponent={<Text style={{ color: colors.muted, fontSize: 15 }}>Nothing here yet.</Text>}
          renderItem={({ item, index }) => (
            <PosterCard
              media={item}
              layout={layout}
              showFocusRing={showFocusRing}
              borderRadius={showFocusRing ? 4 : 6}
              hasTVPreferredFocus={preferFirst && index === 0 ? true : undefined}
              onFocusCard={onFocusCard}
              onPress={() => onOpen(item)}
              onPlay={
                onPlay && canPlayMedia(item) && item.identity.mediaType !== "tv"
                  ? () => onPlay(item)
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
  );
}
