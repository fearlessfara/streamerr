import { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveChannel, LiveNowNext } from "@streamerr/shared";
import {
  liveChannels,
  liveGroups,
  liveNow,
  playLiveChannel,
  toggleLiveFavourite,
} from "@streamerr/client";
import { Artwork } from "../Artwork.js";
import { Button } from "../Button.js";
import { PlayIcon } from "../icons.js";
import { ChannelListSkeleton } from "../Skeleton.js";
import { colors } from "../theme.js";
import { webBg } from "../webStyle.js";
import type { ScreenChromeProps } from "./types.js";

type LiveSort = "number" | "name" | "name_desc";
type ViewMode = "list" | "card";

const SORT_CYCLE: LiveSort[] = ["number", "name", "name_desc"];
const SORT_LABELS: Record<LiveSort, string> = {
  number: "Channel #",
  name: "Name A–Z",
  name_desc: "Name Z–A",
};

export function LiveScreen({
  nav,
  header,
}: Pick<ScreenChromeProps, "nav" | "header">) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string | "favourites" | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LiveSort>("number");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  /** iOS AVPlayer cannot play MPEG-TS — request API live HLS remux. */
  const preferHls = Platform.OS === "ios";

  const groups = useQuery({ queryKey: ["live", "groups"], queryFn: () => liveGroups() });
  const channels = useQuery({
    queryKey: ["live", "channels", groupId, search, page, sort],
    queryFn: () =>
      liveChannels({
        groupId: groupId && groupId !== "favourites" ? groupId : undefined,
        favouritesOnly: groupId === "favourites",
        search: search.trim() || undefined,
        page,
        pageSize: 60,
        sort,
      }),
  });

  const channelUuids = useMemo(
    () => (channels.data?.items ?? []).map((c) => c.uuid),
    [channels.data?.items],
  );

  const nowNext = useQuery({
    queryKey: ["live", "now", channelUuids.join(",")],
    queryFn: () => liveNow(channelUuids),
    enabled: channelUuids.length > 0,
    refetchInterval: 60_000,
  });

  const nowMap = useMemo(() => {
    const map = new Map<string, LiveNowNext>();
    for (const item of nowNext.data?.items ?? []) map.set(item.channelUuid, item);
    return map;
  }, [nowNext.data?.items]);

  const playMutation = useMutation({
    mutationFn: (uuid: string) => playLiveChannel(uuid, { hls: preferHls }),
    onSuccess: (data, uuid) => {
      const list = (channels.data?.items ?? []).map((c) => ({
        uuid: c.uuid,
        name: c.name,
        number: c.number,
      }));
      nav.openPlayer({
        source: data.source,
        title: data.title ?? data.channel?.name ?? "Live TV",
        live: true,
        channelUuid: uuid,
        liveChannels: list.length ? list : [{ uuid, name: data.title ?? "Live TV" }],
      });
    },
  });

  const favMutation = useMutation({
    mutationFn: (uuid: string) => toggleLiveFavourite(uuid),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["live", "channels"] }),
  });

  const totalPages = Math.max(1, Math.ceil((channels.data?.total ?? 0) / 60));
  const favourites = channels.data?.favourites ?? [];
  const items = channels.data?.items ?? [];

  const cycleSort = () => {
    const idx = SORT_CYCLE.indexOf(sort);
    setSort(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]!);
    setPage(1);
  };

  const setFilter = (next: string | "favourites" | "") => {
    setGroupId(next);
    setPage(1);
  };

  const renderChannel = (item: LiveChannel) => {
    const favourite = favourites.includes(item.uuid);
    const now = nowMap.get(item.uuid);
    const onPlay = () => playMutation.mutate(item.uuid);
    if (viewMode === "card") {
      return (
        <ChannelCard
          channel={item}
          now={now}
          favourite={favourite}
          playEnabled={!playMutation.isPending}
          onPlay={onPlay}
          onFav={() => favMutation.mutate(item.uuid)}
        />
      );
    }
    return (
      <ChannelRow
        channel={item}
        now={now}
        favourite={favourite}
        playEnabled={!playMutation.isPending}
        onPlay={onPlay}
        onFav={() => favMutation.mutate(item.uuid)}
      />
    );
  };

  return (
    <View style={styles.page}>
      {header}
      <View style={styles.body}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search channels…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.toolbar}>
          <Button
            label={SORT_LABELS[sort]}
            variant="ghost"
            onPress={cycleSort}
            style={styles.toolbarBtn}
          />
          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setViewMode("list")}
              style={[styles.viewBtn, viewMode === "list" && styles.viewBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === "list" }}
              accessibilityLabel="List view"
            >
              <Text style={[styles.viewBtnLabel, viewMode === "list" && styles.viewBtnLabelOn]}>
                List
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode("card")}
              style={[styles.viewBtn, viewMode === "card" && styles.viewBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === "card" }}
              accessibilityLabel="Card view"
            >
              <Text style={[styles.viewBtnLabel, viewMode === "card" && styles.viewBtnLabelOn]}>
                Card
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filters}
        >
          <Button
            label="All"
            variant={groupId === "" ? "primary" : "ghost"}
            onPress={() => setFilter("")}
            style={styles.filterBtn}
          />
          <Button
            label="Favourites"
            variant={groupId === "favourites" ? "primary" : "ghost"}
            onPress={() => setFilter("favourites")}
            style={styles.filterBtn}
          />
          {(groups.data?.items ?? []).map((g) => (
            <Button
              key={g.id}
              label={g.name}
              variant={groupId === g.id ? "primary" : "ghost"}
              onPress={() => setFilter(g.id)}
              style={styles.filterBtn}
            />
          ))}
        </ScrollView>

        {channels.isLoading ? <ChannelListSkeleton rows={8} /> : null}
        {playMutation.isPending ? (
          <Text style={styles.starting}>Starting live stream…</Text>
        ) : null}
        {playMutation.isError ? (
          <Text style={styles.error}>{(playMutation.error as Error).message}</Text>
        ) : null}

        <FlatList
          key={viewMode}
          data={items}
          keyExtractor={(item) => item.uuid}
          numColumns={viewMode === "card" ? 2 : 1}
          columnWrapperStyle={viewMode === "card" ? styles.cardRow : undefined}
          contentContainerStyle={viewMode === "card" ? styles.cardList : undefined}
          renderItem={({ item }) => renderChannel(item)}
        />

        <View style={styles.pager}>
          <Button label="Prev" variant="ghost" onPress={() => setPage((p) => Math.max(1, p - 1))} />
          <Text style={styles.pageLabel}>
            {page} / {totalPages}
          </Text>
          <Button
            label="Next"
            variant="ghost"
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </View>
      </View>
    </View>
  );
}

function ChannelLogo({
  channel,
  size,
  style,
}: {
  channel: LiveChannel;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(channel.logoUrl) && !failed;
  return (
    <View style={[{ width: size, height: size, borderRadius: 6, overflow: "hidden" }, style]}>
      {showImage ? (
        <Artwork
          url={channel.logoUrl}
          style={{ width: size, height: size }}
          resizeMode="contain"
          maxWidth={size * 2}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.logoFallback, { width: size, height: size }]}>
          <Text style={styles.logoFallbackText} numberOfLines={1}>
            {channel.number != null ? String(channel.number) : channel.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

function PlayChannelButton({
  enabled,
  onPress,
  compact = false,
}: {
  enabled: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel="Play"
      style={({ pressed }) => [
        styles.playBtn,
        compact && styles.playBtnCompact,
        !enabled && styles.playBtnDisabled,
        pressed && enabled && styles.playBtnPressed,
      ]}
    >
      <PlayIcon color="#fff" size={compact ? 14 : 16} />
      <Text style={styles.playBtnLabel}>Play</Text>
    </Pressable>
  );
}

function ChannelRow({
  channel,
  now,
  favourite,
  playEnabled,
  onPlay,
  onFav,
}: {
  channel: LiveChannel;
  now?: LiveNowNext;
  favourite: boolean;
  playEnabled: boolean;
  onPlay: () => void;
  onFav: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.num}>{channel.number ?? ""}</Text>
      <ChannelLogo channel={channel} size={40} style={styles.rowLogo} />
      <Pressable
        onPress={onPlay}
        disabled={!playEnabled}
        style={({ pressed }) => [styles.rowBody, pressed && playEnabled && styles.rowPressed]}
      >
        <Text style={styles.name} numberOfLines={1}>
          {favourite ? "★ " : ""}
          {channel.name}
        </Text>
        <Text style={styles.now} numberOfLines={1}>
          {now?.now?.title ?? "No guide data"}
        </Text>
      </Pressable>
      <PlayChannelButton enabled={playEnabled} onPress={onPlay} compact />
      <Button label={favourite ? "Unfav" : "Fav"} variant="ghost" onPress={onFav} />
    </View>
  );
}

function ChannelCard({
  channel,
  now,
  favourite,
  playEnabled,
  onPlay,
  onFav,
}: {
  channel: LiveChannel;
  now?: LiveNowNext;
  favourite: boolean;
  playEnabled: boolean;
  onPlay: () => void;
  onFav: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <ChannelLogo channel={channel} size={56} />
        <Pressable onPress={onFav} hitSlop={8} style={styles.cardFav}>
          <Text style={styles.cardFavLabel}>{favourite ? "★" : "☆"}</Text>
        </Pressable>
      </View>
      {channel.number != null ? <Text style={styles.cardNum}>{channel.number}</Text> : null}
      <Text style={styles.cardName} numberOfLines={2}>
        {channel.name}
      </Text>
      <Text style={styles.cardNow} numberOfLines={2}>
        {now?.now?.title ?? "No guide data"}
      </Text>
      <PlayChannelButton enabled={playEnabled} onPress={onPlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: webBg },
  body: { flex: 1, paddingHorizontal: 16 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginBottom: 10,
  },
  toolbarBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  viewToggle: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.bg2,
  },
  viewBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  viewBtnOn: {
    backgroundColor: colors.text,
  },
  viewBtnLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  viewBtnLabelOn: {
    color: colors.bg,
  },
  filtersScroll: { flexGrow: 0, marginBottom: 10, maxHeight: 48 },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  starting: { color: colors.muted, marginBottom: 8, fontSize: 13 },
  error: { color: colors.danger, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bg2,
  },
  rowPressed: { backgroundColor: colors.bg1 },
  num: { color: colors.muted, width: 36, fontSize: 14 },
  rowLogo: { backgroundColor: colors.bg2 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  now: { color: colors.muted, fontSize: 13, marginTop: 2 },
  logoFallback: {
    backgroundColor: colors.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  cardList: { paddingBottom: 8 },
  cardRow: { gap: 10 },
  card: {
    flex: 1,
    backgroundColor: colors.bg1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardFav: { padding: 4 },
  cardFavLabel: { color: colors.accent, fontSize: 18 },
  cardNum: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  cardName: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  cardNow: { color: colors.muted, fontSize: 12, lineHeight: 16, marginBottom: 10 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  playBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  playBtnDisabled: {
    opacity: 0.45,
  },
  playBtnPressed: {
    opacity: 0.85,
  },
  playBtnLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
  },
  pageLabel: { color: colors.text, fontSize: 15 },
});
