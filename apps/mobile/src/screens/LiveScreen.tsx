import { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { LiveChannel, LiveNowNext } from "@streamerr/shared";
import {
  liveChannels,
  liveGroups,
  liveNow,
  playLiveChannel,
  toggleLiveFavourite,
} from "@streamerr/client";
import { Button } from "../components/Button";
import { ScreenHeader } from "../components/ScreenHeader";
import { ChannelListSkeleton } from "../components/Skeleton";
import { colors } from "../theme";
import type { Nav } from "../nav";

const LIVE_SUPPORTED = Platform.OS === "android";

export function LiveScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string | "favourites" | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const groups = useQuery({ queryKey: ["live", "groups"], queryFn: () => liveGroups() });
  const channels = useQuery({
    queryKey: ["live", "channels", groupId, search, page],
    queryFn: () =>
      liveChannels({
        groupId: groupId && groupId !== "favourites" ? groupId : undefined,
        favouritesOnly: groupId === "favourites",
        search: search.trim() || undefined,
        page,
        pageSize: 60,
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
    mutationFn: (uuid: string) => playLiveChannel(uuid),
    onSuccess: (data, uuid) => {
      const list = (channels.data?.items ?? []).map((c) => ({
        uuid: c.uuid,
        name: c.name,
        number: c.number,
      }));
      navigation.navigate("Player", {
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

  return (
    <View style={styles.page}>
      <ScreenHeader username={username} title="Live TV" />
      <View style={styles.body}>
        {!LIVE_SUPPORTED ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Live TV unavailable on iOS</Text>
            <Text style={styles.bannerCopy}>
              Live channels stream as MPEG-TS, which AVPlayer cannot play. Android playback works
              today. An iOS HLS remux from the API is planned next.
            </Text>
          </View>
        ) : null}
        <View style={styles.filters}>
          <Button
            label="All"
            variant={groupId === "" ? "primary" : "ghost"}
            onPress={() => {
              setGroupId("");
              setPage(1);
            }}
            style={styles.filterBtn}
          />
          <Button
            label="Favourites"
            variant={groupId === "favourites" ? "primary" : "ghost"}
            onPress={() => {
              setGroupId("favourites");
              setPage(1);
            }}
            style={styles.filterBtn}
          />
          {(groups.data?.items ?? []).slice(0, 12).map((g) => (
            <Button
              key={g.id}
              label={g.name}
              variant={groupId === g.id ? "primary" : "ghost"}
              onPress={() => {
                setGroupId(g.id);
                setPage(1);
              }}
              style={styles.filterBtn}
            />
          ))}
        </View>
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
        {channels.isLoading ? <ChannelListSkeleton rows={8} /> : null}
        {playMutation.isError ? (
          <Text style={styles.error}>{(playMutation.error as Error).message}</Text>
        ) : null}
        <FlatList
          data={channels.data?.items ?? []}
          keyExtractor={(item) => item.uuid}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              now={nowMap.get(item.uuid)}
              favourite={(channels.data?.favourites ?? []).includes(item.uuid)}
              playEnabled={LIVE_SUPPORTED}
              onPlay={() => {
                if (!LIVE_SUPPORTED) return;
                playMutation.mutate(item.uuid);
              }}
              onFav={() => favMutation.mutate(item.uuid)}
            />
          )}
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
    <Pressable
      onPress={onPlay}
      disabled={!playEnabled}
      style={({ pressed }) => [styles.row, pressed && playEnabled && styles.rowPressed]}
    >
      <Text style={styles.num}>{channel.number ?? ""}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.name}>
          {favourite ? "★ " : ""}
          {channel.name}
        </Text>
        <Text style={styles.now} numberOfLines={1}>
          {now?.now?.title ?? "No guide data"}
        </Text>
      </View>
      <Button label={favourite ? "Unfav" : "Fav"} variant="ghost" onPress={onFav} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16 },
  banner: {
    backgroundColor: colors.bg2,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  bannerTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 6 },
  bannerCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
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
  num: { color: colors.muted, width: 40, fontSize: 14 },
  rowBody: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  now: { color: colors.muted, fontSize: 13, marginTop: 2 },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
  },
  pageLabel: { color: colors.text, fontSize: 15 },
});
