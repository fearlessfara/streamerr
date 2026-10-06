import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
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
import { Chrome } from "../components/Chrome";
import { Focusable } from "../components/Focusable";
import { TvTextInput } from "../components/TvTextInput";
import { isTvFocused } from "../focus";
import { colors } from "../theme";
import type { Nav } from "../nav";

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
    <Chrome username={username}>
      <View style={styles.page}>
        <Text style={styles.h1}>Live TV</Text>
        <View style={styles.filters}>
          <Focusable
            label="All"
            onPress={() => {
              setGroupId("");
              setPage(1);
            }}
            hasTVPreferredFocus
          />
          <Focusable
            label="Favourites"
            onPress={() => {
              setGroupId("favourites");
              setPage(1);
            }}
          />
          {(groups.data?.items ?? []).slice(0, 12).map((g) => (
            <Focusable
              key={g.id}
              label={g.name}
              onPress={() => {
                setGroupId(g.id);
                setPage(1);
              }}
            />
          ))}
        </View>
        <TvTextInput
          style={styles.search}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search channels…"
          placeholderTextColor={colors.muted}
        />
        {channels.isLoading ? <ActivityIndicator color={colors.text} /> : null}
        <FlatList
          data={channels.data?.items ?? []}
          keyExtractor={(item) => item.uuid}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              now={nowMap.get(item.uuid)}
              favourite={(channels.data?.favourites ?? []).includes(item.uuid)}
              onPlay={() => playMutation.mutate(item.uuid)}
              onFav={() => favMutation.mutate(item.uuid)}
            />
          )}
        />
        <View style={styles.pager}>
          <Focusable label="Prev" onPress={() => setPage((p) => Math.max(1, p - 1))} />
          <Text style={styles.pageLabel}>
            {page} / {totalPages}
          </Text>
          <Focusable label="Next" onPress={() => setPage((p) => Math.min(totalPages, p + 1))} />
        </View>
      </View>
    </Chrome>
  );
}

function ChannelRow({
  channel,
  now,
  favourite,
  onPlay,
  onFav,
}: {
  channel: LiveChannel;
  now?: LiveNowNext;
  favourite: boolean;
  onPlay: () => void;
  onFav: () => void;
}) {
  return (
    <Pressable onPress={onPlay} style={(s) => [styles.row, isTvFocused(s) && styles.rowFocused]}>
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
      <Focusable label={favourite ? "Unfav" : "Fav"} onPress={onFav} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 48 },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800", marginBottom: 12 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  search: {
    backgroundColor: colors.bg2,
    color: colors.text,
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    maxWidth: 420,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 4,
    gap: 12,
  },
  rowFocused: { backgroundColor: colors.bg2 },
  num: { color: colors.muted, width: 48, fontSize: 16 },
  rowBody: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: "600" },
  now: { color: colors.muted, fontSize: 14 },
  pager: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
  pageLabel: { color: colors.text, fontSize: 16 },
});
