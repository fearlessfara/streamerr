import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";
import { useMobileLayout } from "../layout";

type BlockProps = {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
};

export function SkeletonBlock({ width = "100%", height = 16, style, radius = 4 }: BlockProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.bg2,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function CatalogSkeleton({ cards = 6 }: { cards?: number }) {
  const layout = useMobileLayout();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: layout.cardGap,
        paddingHorizontal: layout.pageX,
      }}
      accessibilityLabel="Loading"
    >
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonBlock
          key={i}
          width={layout.cardWidth}
          height={layout.posterH}
          style={{ marginBottom: 4 }}
        />
      ))}
    </View>
  );
}

export function RailSkeleton({ rails = 3, cards = 5 }: { rails?: number; cards?: number }) {
  const layout = useMobileLayout();
  return (
    <View accessibilityLabel="Loading">
      {Array.from({ length: rails }, (_, rail) => (
        <View key={rail} style={{ paddingLeft: layout.pageX, marginBottom: layout.railGap }}>
          <SkeletonBlock width={140} height={layout.railTitleSize} style={{ marginBottom: 10 }} />
          <View style={{ flexDirection: "row", gap: layout.cardGap, overflow: "hidden" }}>
            {Array.from({ length: cards }, (_, card) => (
              <SkeletonBlock key={card} width={layout.cardWidth} height={layout.posterH} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function HomeSkeleton() {
  const layout = useMobileLayout();
  return (
    <View accessibilityLabel="Loading">
      <View style={{ height: layout.heroH, marginBottom: layout.railGap, justifyContent: "flex-end" }}>
        <SkeletonBlock width="100%" height={layout.heroH} radius={0} style={StyleSheet.absoluteFill} />
        <View style={{ paddingHorizontal: layout.pageX, paddingBottom: 16, gap: 10 }}>
          <SkeletonBlock width="70%" height={28} />
          <SkeletonBlock width="40%" height={14} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <SkeletonBlock width={96} height={40} />
            <SkeletonBlock width={96} height={40} />
          </View>
        </View>
      </View>
      <RailSkeleton rails={2} cards={4} />
    </View>
  );
}

export function DetailsSkeleton() {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      <SkeletonBlock width="100%" height={180} />
      <SkeletonBlock width="75%" height={28} />
      <SkeletonBlock width="45%" height={14} />
      <SkeletonBlock width="100%" height={14} />
      <SkeletonBlock width="90%" height={14} />
      <SkeletonBlock width="60%" height={14} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <SkeletonBlock width={120} height={44} />
        <SkeletonBlock width={120} height={44} />
      </View>
    </View>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <SkeletonBlock width={48} height={72} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBlock width="70%" height={16} />
            <SkeletonBlock width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChannelListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.channelRow}>
          <SkeletonBlock width={36} height={36} radius={4} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="75%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function BootSkeleton() {
  return (
    <View style={styles.boot} accessibilityLabel="Loading">
      <SkeletonBlock width={180} height={22} />
      <SkeletonBlock width={110} height={12} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  listRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
  },
  channelRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
