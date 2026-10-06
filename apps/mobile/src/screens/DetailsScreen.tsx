import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { EpisodeListItem } from "@streamerr/shared";
import {
  actionLabel,
  cancelAcquisition,
  formatCacheTtlRemaining,
  formatRuntime,
  getAcquisition,
  mediaByJellyfin,
  mediaByTmdb,
  promoteAcquisition,
  requestMedia,
  resolvePlaybackForPlay,
  seriesEpisodes,
} from "@streamerr/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Artwork } from "../artwork";
import { Button } from "../components/Button";
import { DetailsSkeleton } from "../components/Skeleton";
import { colors } from "../theme";
import type { Nav, RootStackParamList } from "../nav";

export function DetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { jellyfinItemId, type, tmdbId } = route.params;
  const isJellyfin = Boolean(jellyfinItemId);
  const queryKey = isJellyfin
    ? (["media", "jellyfin", jellyfinItemId] as const)
    : (["media", type, tmdbId] as const);

  const details = useQuery({
    queryKey,
    queryFn: () => {
      if (isJellyfin && jellyfinItemId) return mediaByJellyfin(jellyfinItemId);
      if ((type === "movie" || type === "tv") && tmdbId != null) return mediaByTmdb(type, tmdbId);
      throw new Error("Missing media id");
    },
  });

  const media = details.data?.media;
  const cache = media?.availability.find((a) => a.provider === "cache");
  const isTv = media?.identity.mediaType === "tv" || type === "tv";
  const seriesTmdbId = media?.identity.tmdbId ?? tmdbId;
  const [season, setSeason] = useState<number | null>(null);
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);

  const episodesQuery = useQuery({
    queryKey: ["media", "tv", seriesTmdbId, "episodes"],
    queryFn: () => seriesEpisodes(seriesTmdbId!),
    enabled: Boolean(isTv && seriesTmdbId),
  });

  useEffect(() => {
    const seasons = episodesQuery.data?.seasons ?? [];
    if (seasons.length && (season === null || !seasons.includes(season))) {
      setSeason(seasons[0]!);
    }
  }, [episodesQuery.data?.seasons, season]);

  const seasonEpisodes = useMemo(() => {
    const items = episodesQuery.data?.items ?? [];
    if (season === null) return items;
    return items.filter((e) => e.seasonNumber === season);
  }, [episodesQuery.data?.items, season]);

  const play = useMutation({
    mutationFn: async () => {
      if (!media) throw new Error("No media");
      setBufferStatus("Resolving…");
      return resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            setBufferStatus(`Buffering… ${Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))}%`);
          } else {
            setBufferStatus(`Buffering… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      });
    },
    onSuccess: (source) => {
      setBufferStatus(null);
      navigation.navigate("Player", {
        source,
        title: media?.metadata.title,
        identity: media?.identity,
      });
    },
    onError: () => setBufferStatus(null),
  });

  const playEpisode = useMutation({
    mutationFn: async (ep: EpisodeListItem) => {
      setBufferStatus("Resolving…");
      const source = await resolvePlaybackForPlay(ep.identity, {
        meta: { runtimeMinutes: ep.runtimeMinutes },
      });
      return { source, ep };
    },
    onSuccess: ({ source, ep }) => {
      setBufferStatus(null);
      navigation.navigate("Player", { source, title: ep.title, identity: ep.identity });
    },
    onError: () => setBufferStatus(null),
  });

  const request = useMutation({
    mutationFn: () => requestMedia(media!.identity),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  const acquisitionId = cache?.acquisitionId;
  const acquisition = useQuery({
    queryKey: ["acquisition", acquisitionId],
    queryFn: () => getAcquisition(acquisitionId!),
    enabled: Boolean(acquisitionId),
    refetchInterval: (q) => {
      const state = q.state.data?.item.state;
      if (state === "downloading" || state === "queued" || state === "playable") return 1500;
      return false;
    },
  });

  const ttl = formatCacheTtlRemaining(acquisition.data?.item.cacheExpiresAt);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {details.isLoading ? <DetailsSkeleton /> : null}
        {details.isError ? <Text style={styles.error}>{(details.error as Error).message}</Text> : null}
        {media ? (
          <>
            <Artwork url={media.metadata.backdropUrl} maxWidth={1280} style={styles.backdrop} />
            <Text style={styles.title}>{media.metadata.title}</Text>
            <Text style={styles.meta}>
              {[media.metadata.year, formatRuntime(media.metadata.runtimeMinutes), media.identity.mediaType]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
            {media.metadata.overview ? <Text style={styles.overview}>{media.metadata.overview}</Text> : null}
            {bufferStatus ? <Text style={styles.buffer}>{bufferStatus}</Text> : null}
            {ttl ? <Text style={styles.meta}>Cache {ttl}</Text> : null}
            {play.isError ? <Text style={styles.error}>{(play.error as Error).message}</Text> : null}
            <View style={styles.actions}>
              {media.preferredAction === "REQUEST" ? (
                <Button label="Request" onPress={() => request.mutate()} />
              ) : (
                <Button
                  label={actionLabel(media).replace(/^▶\s*/, "")}
                  onPress={() => play.mutate()}
                  disabled={play.isPending}
                />
              )}
              {acquisitionId &&
              (acquisition.data?.item.state === "completed" || acquisition.data?.item.state === "playable") ? (
                <Button
                  label="Add to library"
                  variant="ghost"
                  onPress={() => promoteAcquisition(acquisitionId).then(() => qc.invalidateQueries())}
                />
              ) : null}
              {acquisitionId &&
              (acquisition.data?.item.state === "downloading" || acquisition.data?.item.state === "queued") ? (
                <Button
                  label="Cancel download"
                  variant="ghost"
                  onPress={() => cancelAcquisition(acquisitionId)}
                />
              ) : null}
            </View>
            {isTv ? (
              <View style={styles.seasons}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonRow}>
                  {(episodesQuery.data?.seasons ?? []).map((s) => (
                    <Button
                      key={s}
                      label={`S${s}`}
                      variant={season === s ? "primary" : "ghost"}
                      onPress={() => setSeason(s)}
                      style={{ marginRight: 8 }}
                    />
                  ))}
                </ScrollView>
                {seasonEpisodes.map((ep) => (
                  <Pressable
                    key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                    onPress={() => playEpisode.mutate(ep)}
                    style={({ pressed }) => [styles.episode, pressed && styles.episodePressed]}
                  >
                    <Text style={styles.episodeTitle}>
                      {ep.seasonNumber}x{String(ep.episodeNumber).padStart(2, "0")}  {ep.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  backdrop: { height: 200, borderRadius: 8, marginBottom: 16, opacity: 0.7 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  meta: { color: colors.muted, marginTop: 8, fontSize: 15 },
  overview: { color: colors.text, marginTop: 14, fontSize: 15, lineHeight: 22 },
  buffer: { color: colors.text, marginTop: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  error: { color: colors.danger, marginTop: 8 },
  seasons: { marginTop: 24 },
  seasonRow: { marginBottom: 12 },
  episode: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.bg2 },
  episodePressed: { opacity: 0.85 },
  episodeTitle: { color: colors.text, fontSize: 15 },
});
