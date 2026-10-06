import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  View,
} from "react-native";
import Video, {
  SelectedTrackType,
  TextTrackType,
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from "react-native-video";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  absoluteUrl,
  classifyPlayback,
  getClient,
  isIptvProgressSource,
  listPlaybackSubtitles,
  loadSubtitlePref,
  playLiveChannel,
  reportIptvProgress,
  reportProgress,
  resolvePlayback,
  resolveSubtitleIndex,
  saveSubtitleOff,
  saveSubtitleTrack,
  seekCapForSource,
  textSubtitles,
} from "@streamerr/client";
import type { PlaybackSource, SubtitleTrack } from "@streamerr/shared";
import { isTvFocused } from "../focus";
import { colors } from "../theme";
import type { RootStackParamList } from "../nav";

const HIDE_MS = 3000;
const SKIP_S = 10;

function PlayIcon({ color, size = 32 }: { color: string; size?: number }) {
  const height = size * (14 / 24);
  const width = size * (11 / 24);
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * (3 / 24),
        borderLeftWidth: width,
        borderTopWidth: height / 2,
        borderBottomWidth: height / 2,
        borderLeftColor: color,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
      }}
    />
  );
}

function PauseIcon({ color, size = 32 }: { color: string; size?: number }) {
  const barW = size * (4 / 24);
  const barH = size * (14 / 24);
  return (
    <View style={{ width: size, height: size, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: size * (4 / 24) }}>
      <View style={{ width: barW, height: barH, backgroundColor: color }} />
      <View style={{ width: barW, height: barH, backgroundColor: color }} />
    </View>
  );
}

function BackIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 12,
        height: 12,
        marginLeft: 4,
        borderLeftWidth: 3,
        borderBottomWidth: 3,
        borderColor: color,
        transform: [{ rotate: "45deg" }],
      }}
    />
  );
}

function SkipIcon({ color, dir }: { color: string; dir: "back" | "forward" }) {
  return (
    <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2.5,
          borderColor: color,
          borderRightColor: "transparent",
          transform: [{ rotate: dir === "back" ? "-30deg" : "150deg" }],
        }}
      />
      <Text style={{ color, fontSize: 10, fontWeight: "800", marginTop: 3 }}>10</Text>
    </View>
  );
}

function CcIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 28,
        height: 20,
        borderWidth: 2,
        borderColor: color,
        borderRadius: 3,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color, fontSize: 10, fontWeight: "800", letterSpacing: -0.3 }}>CC</Text>
    </View>
  );
}

function PlayerButton({
  label,
  icon,
  onPress,
  preferred,
  large,
}: {
  label: string;
  icon?: (color: string) => ReactNode;
  onPress: () => void;
  preferred?: boolean;
  large?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={(state) => [
        icon ? styles.iconBtn : styles.btn,
        icon && large ? styles.iconBtnLarge : null,
        isTvFocused(state) && (icon ? styles.iconBtnFocused : styles.btnFocused),
      ]}
    >
      {(state) =>
        icon ? (
          icon(colors.text)
        ) : (
          <Text style={[styles.btnText, isTvFocused(state) && styles.btnTextFocused]}>{label}</Text>
        )
      }
    </Pressable>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const params = route.params;
  const videoRef = useRef<VideoRef>(null);
  const [source, setSource] = useState<PlaybackSource>(params.source);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(source.durationSeconds ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(source.subtitles ?? []);
  const [menu, setMenu] = useState<"none" | "audio" | "subs">("none");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const controlsRef = useRef(controls);
controlsRef.current = controls;
  const progressStarted = useRef(false);
  const client = getClient();
  const isLive = Boolean(params.live);
  const identity = params.identity;

  const reveal = useCallback((keep = false) => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!keep) {
      hideTimer.current = setTimeout(() => setControls(false), HIDE_MS);
    }
  }, []);

  useEffect(() => {
    reveal(menu !== "none");
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [menu, reveal]);

  useEffect(() => {
    setSource(params.source);
    setSubtitleTracks(params.source.subtitles ?? []);
    progressStarted.current = false;
  }, [params.source]);

  useEffect(() => {
    void loadSubtitlePref(AsyncStorage).then((pref) => {
      setSubIndex(resolveSubtitleIndex(textSubtitles(subtitleTracks), pref));
    });
  }, [subtitleTracks]);

  useEffect(() => {
    if (!identity || isLive) return;
    const ac = new AbortController();
    void listPlaybackSubtitles(identity, {
      existing: source.subtitles,
      provider: source.provider,
      signal: ac.signal,
    })
      .then((tracks) => setSubtitleTracks(tracks))
      .catch(() => undefined);
    return () => ac.abort();
  }, [identity, isLive, source.provider, source.subtitles]);

  const kind = classifyPlayback(source);
  const origin = client.baseUrl || "http://localhost";
  const uri = absoluteUrl(source.delivery.url, origin);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client.sessionHeaders().then((next) => {
      if (cancelled) return;
      setHeaders({
        ...next,
        "User-Agent": "ExoPlayerLib/2.19.1",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const knownDuration = duration > 0 ? duration : source.durationSeconds ?? 0;
  const seekCap = seekCapForSource(source, knownDuration);

  const videoType = kind === "hls" ? "m3u8" : kind === "mpegts" ? "mpegts" : undefined;

  const sideloaded = useMemo(
    () =>
      textSubtitles(subtitleTracks).map((track) => ({
        title: track.label || track.language || "Subtitle",
        language: (track.language?.slice(0, 2).toLowerCase() || "en") as "en",
        type: track.url.endsWith(".vtt") ? TextTrackType.VTT : TextTrackType.SUBRIP,
        uri: absoluteUrl(track.url, origin),
      })),
    [subtitleTracks, origin],
  );

  const report = useCallback(
    (event: "start" | "progress" | "stopped", seconds: number, pausedNow?: boolean) => {
      if (source.itemId) {
        void reportProgress({
          itemId: source.itemId,
          positionSeconds: seconds,
          event,
          playSessionId: source.playSessionId,
          mediaSourceId: source.mediaSourceId,
          isPaused: pausedNow,
        });
      } else if (isIptvProgressSource(source.provider, isLive, identity) && identity) {
        void reportIptvProgress({
          identity,
          positionSeconds: seconds,
          durationSeconds: knownDuration > 0 ? knownDuration : undefined,
          event,
          title: params.title,
        });
      }
    },
    [identity, isLive, knownDuration, params.title, source],
  );

  useEffect(() => {
    if (!progressStarted.current) {
      progressStarted.current = true;
      report("start", source.startPositionSeconds && source.startPositionSeconds > 30 ? source.startPositionSeconds : 0);
    }
    const id = setInterval(() => report("progress", position, paused), 10_000);
    return () => {
      clearInterval(id);
      report("stopped", position, true);
    };
    // position is sampled via interval; don't restart the interval every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.itemId, source.playSessionId, identity?.tmdbId]);

  const skip = (delta: number) => {
    const next = Math.max(0, Math.min(seekCap === Infinity ? position + delta : seekCap, position + delta));
    videoRef.current?.seek(next);
    setPosition(next);
    reveal();
  };

  const zap = async (dir: 1 | -1) => {
    const list = params.liveChannels ?? [];
    if (!list.length || !params.channelUuid) return;
    const idx = list.findIndex((c) => c.uuid === params.channelUuid);
    const next = list[(idx + dir + list.length) % list.length];
    if (!next) return;
    const data = await playLiveChannel(next.uuid);
    navigation.setParams({
      source: data.source,
      title: data.title ?? next.name,
      live: true,
      channelUuid: next.uuid,
      liveChannels: list,
    } as never);
  };

  const selectAudio = async (index: number) => {
    if (source.provider !== "jellyfin" || !identity?.jellyfinItemId) {
      setAudioIndex(index);
      setMenu("none");
      return;
    }
    const result = await resolvePlayback(identity, {
      audioStreamIndex: index,
      startPositionSeconds: Math.floor(position),
    });
    if (result.status !== "ready") return;
    setAudioIndex(index);
    setMenu("none");
    navigation.setParams({
      ...params,
      source: {
        ...result.source,
        startPositionSeconds: position,
        durationSeconds: result.source.durationSeconds ?? source.durationSeconds,
        subtitles: subtitleTracks.length ? subtitleTracks : result.source.subtitles,
      },
    } as never);
  };

  useTVEventHandler((evt) => {
    if (!evt) return;
    const type = evt.eventType;
    if (type === "menu") {
      navigation.goBack();
      return;
    }
    const userKey =
      type === "select" ||
      type === "playPause" ||
      type === "play" ||
      type === "pause" ||
      type === "left" ||
      type === "right" ||
      type === "up" ||
      type === "down" ||
      type === "fastForward" ||
      type === "rewind";
    if (!controlsRef.current) {
      if (userKey) reveal();
      return;
    }
    if (type === "playPause") {
      setPaused((p) => !p);
      reveal();
    } else if (type === "fastForward") {
      skip(SKIP_S);
    } else if (type === "rewind") {
      skip(-SKIP_S);
    } else if (isLive && (type === "channelUp" || type === "up")) {
      void zap(1);
    } else if (isLive && (type === "channelDown" || type === "down")) {
      void zap(-1);
    } else if (type === "select" || type === "left" || type === "right" || type === "up" || type === "down") {
      reveal();
    }
  });

  const onLoad = (data: OnLoadData) => {
    const d = Number.isFinite(data.duration) && data.duration > 0 ? data.duration : knownDuration;
    setDuration(d);
    const start = source.startPositionSeconds ?? 0;
    if (start > 30 && !isLive) {
      videoRef.current?.seek(start);
      setPosition(start);
    }
  };

  const onProgress = (data: OnProgressData) => {
    setPosition(data.currentTime);
  };

  const selectedTextTrack =
    subIndex == null
      ? { type: SelectedTrackType.DISABLED }
      : { type: SelectedTrackType.INDEX, value: subIndex };

  const progressRatio =
    !isLive && knownDuration > 0 ? Math.min(1, Math.max(0, position / knownDuration)) : 0;

  return (
    <View style={styles.root}>
      {headers ? (
      <Video
        ref={videoRef}
        source={{ uri, headers, type: videoType }}
        style={styles.video}
        paused={paused}
        resizeMode="contain"
        onLoad={onLoad}
        onProgress={onProgress}
        onEnd={() => navigation.goBack()}
        onError={(e) => setError(e.error?.errorString ?? "Playback failed")}
        textTracks={sideloaded}
        selectedTextTrack={selectedTextTrack}
        reportBandwidth
        ignoreSilentSwitch="ignore"
        playInBackground={false}
        controls={false}
      />
      ) : null}
      {controls || error ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.top}>
            <PlayerButton label="Back" icon={(color) => <BackIcon color={color} />} onPress={() => navigation.goBack()} />
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {params.title ?? "Streamerr"}
              </Text>
              {isLive ? <Text style={styles.live}>LIVE</Text> : null}
            </View>
          </View>
          <View style={styles.bottom}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!isLive ? (
              <View style={styles.track}>
                <View style={[styles.played, { flex: progressRatio }]} />
                <View style={{ flex: Math.max(0.0001, 1 - progressRatio) }} />
              </View>
            ) : null}
            <View style={styles.transport}>
              <View style={styles.transportLeft}>
                {!isLive ? (
                  <PlayerButton
                    label="Rewind 10 seconds"
                    icon={(color) => <SkipIcon color={color} dir="back" />}
                    onPress={() => skip(-SKIP_S)}
                  />
                ) : null}
                <PlayerButton
                  label={paused ? "Play" : "Pause"}
                  large
                  preferred
                  icon={(color) =>
                    paused ? <PlayIcon color={color} /> : <PauseIcon color={color} />
                  }
                  onPress={() => {
                    setPaused((p) => !p);
                    reveal();
                  }}
                />
                {!isLive ? (
                  <PlayerButton
                    label="Forward 10 seconds"
                    icon={(color) => <SkipIcon color={color} dir="forward" />}
                    onPress={() => skip(SKIP_S)}
                  />
                ) : null}
                {(source.audioTracks?.length ?? 0) > 1 ? (
                  <PlayerButton
                    label="Audio"
                    onPress={() => setMenu(menu === "audio" ? "none" : "audio")}
                  />
                ) : null}
                {sideloaded.length ? (
                  <PlayerButton
                    label="Subtitles"
                    icon={(color) => <CcIcon color={color} />}
                    onPress={() => setMenu(menu === "subs" ? "none" : "subs")}
                  />
                ) : null}
              </View>
              <Text style={styles.time}>
                {isLive ? "LIVE" : `${formatTime(position)} / ${formatTime(knownDuration || seekCap)}`}
              </Text>
            </View>
            {menu === "audio"
              ? (source.audioTracks ?? []).map((track) => (
                  <PlayerButton
                    key={track.index}
                    label={`${audioIndex === track.index ? "● " : ""}${track.label || track.language || `Audio ${track.index}`}`}
                    onPress={() => void selectAudio(track.index)}
                  />
                ))
              : null}
            {menu === "subs" ? (
              <View style={styles.menu}>
                <PlayerButton
                  label="Off"
                  onPress={() => {
                    setSubIndex(null);
                    void saveSubtitleOff(AsyncStorage);
                    setMenu("none");
                  }}
                />
                {textSubtitles(subtitleTracks).map((track, index) => (
                  <PlayerButton
                    key={`${track.url}-${index}`}
                    label={`${subIndex === index ? "● " : ""}${track.label || track.language || `Subtitle ${index + 1}`}`}
                    onPress={() => {
                      setSubIndex(index);
                      void saveSubtitleTrack(track, AsyncStorage);
                      setMenu("none");
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  video: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    paddingHorizontal: 48,
    paddingTop: 36,
    paddingBottom: 40,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 16 },
  titleBlock: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", flexShrink: 1 },
  live: { color: colors.accent, fontWeight: "800" },
  bottom: {
    alignSelf: "stretch",
    gap: 14,
  },
  error: { color: colors.danger, marginBottom: 4 },
  track: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
    flexDirection: "row",
  },
  played: { height: 5, backgroundColor: colors.accent },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
  },
  transportLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconBtnLarge: { width: 56, height: 56, borderRadius: 28 },
  iconBtnFocused: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: colors.text,
  },
  btn: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(47,47,47,0.95)",
    borderRadius: 4,
  },
  btnFocused: { backgroundColor: colors.text },
  btnText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  btnTextFocused: { color: colors.bg },
  time: { color: colors.muted, fontSize: 16, fontVariant: ["tabular-nums"] },
});
