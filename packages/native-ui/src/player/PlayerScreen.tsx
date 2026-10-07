import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import type { KeyValueStorage } from "@streamerr/client";
import {
  absoluteUrl,
  getClient,
  isIptvProgressSource,
  listPlaybackSubtitles,
  loadSubtitlePref,
  playLiveChannel,
  reportIptvProgress,
  reportProgress,
  resolveSubtitleIndex,
  saveSubtitleOff,
  saveSubtitleTrack,
  seekCapForSource,
  textSubtitles,
} from "@streamerr/client";
import type { MediaIdentity, PlaybackSource, SubtitleTrack } from "@streamerr/shared";
import { colors } from "../theme.js";
import type { LiveChannelRef } from "../screens/types.js";
import type { VideoSurfaceProps, VideoTransport } from "./VideoSurfaceProps.js";
import {
  NfAudioSubsIcon,
  NfBackIcon,
  NfEpisodesIcon,
  NfFlagIcon,
  NfForward10Icon,
  NfFullscreenIcon,
  NfNextEpisodeIcon,
  NfPauseIcon,
  NfPlayIcon,
  NfRewind10Icon,
  NfSpeedIcon,
  NfVolumeIcon,
} from "./PlayerIcons.js";

const HIDE_MS = 3500;
/** Netflix-style skip step (seconds). */
const SKIP_S = 10;
/** Delay before held arrow keys start auto-repeating seeks. */
const SEEK_HOLD_DELAY_MS = 320;
/** Interval between repeated seeks while an arrow key is held. */
const SEEK_HOLD_INTERVAL_MS = 280;

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlayerRouteParams = {
  source: PlaybackSource;
  title?: string;
  live?: boolean;
  identity?: MediaIdentity;
  channelUuid?: string;
  liveChannels?: LiveChannelRef[];
};

export type PlayerScreenProps = {
  params: PlayerRouteParams;
  storage: KeyValueStorage;
  VideoSurface: ComponentType<VideoSurfaceProps>;
  onClose: () => void;
  onReplaceParams: (next: PlayerRouteParams) => void;
  /** Platform UA for media requests. */
  userAgent?: string;
  /** Disable live channel zap (e.g. iOS). */
  liveZapEnabled?: boolean;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function IconButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e?.stopPropagation?.();
        onPress();
      }}
      style={styles.iconBtn}
      accessibilityLabel={label}
      hitSlop={8}
    >
      {children}
    </Pressable>
  );
}

export function PlayerScreen({
  params,
  storage,
  VideoSurface,
  onClose,
  onReplaceParams,
  userAgent = "Streamerr/1.0",
  liveZapEnabled = true,
}: PlayerScreenProps) {
  const [source, setSource] = useState<PlaybackSource>(params.source);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(source.durationSeconds ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(source.subtitles ?? []);
  const [menu, setMenu] = useState<"none" | "subs" | "speed">("none");
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const seekFn = useRef<((seconds: number) => void) | null>(null);
  const transportRef = useRef<VideoTransport | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressStarted = useRef(false);
  const positionRef = useRef(0);
  const seekCapRef = useRef(Infinity);
  const barWidthRef = useRef(0);
  const client = getClient();
  const isLive = Boolean(params.live);
  const identity = params.identity;

  const reveal = useCallback((keep = false) => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!keep) hideTimer.current = setTimeout(() => setControls(false), HIDE_MS);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
    reveal();
  }, [reveal]);

  /** Seek relative to the latest position (safe for key-repeat timers). */
  const skipBy = useCallback(
    (delta: number) => {
      if (isLive) return;
      const cap = seekCapRef.current;
      const next = Math.max(
        0,
        Math.min(cap === Infinity ? positionRef.current + delta : cap, positionRef.current + delta),
      );
      seekFn.current?.(next);
      positionRef.current = next;
      setPosition(next);
      reveal();
    },
    [isLive, reveal],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (isLive) return;
      const cap = seekCapRef.current;
      const dur = cap === Infinity ? 0 : cap;
      if (dur <= 0) return;
      const next = Math.max(0, Math.min(dur, ratio * dur));
      seekFn.current?.(next);
      positionRef.current = next;
      setPosition(next);
      reveal();
    },
    [isLive, reveal],
  );

  useEffect(() => {
    reveal(menu !== "none");
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [menu, reveal]);

  // Mouse movement reveals the Netflix chrome overlay (web).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMove = () => reveal(menu !== "none");
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [menu, reveal]);

  // Keep fullscreen state in sync with the document.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    setSource(params.source);
    setSubtitleTracks(params.source.subtitles ?? []);
    progressStarted.current = false;
  }, [params.source]);

  useEffect(() => {
    void loadSubtitlePref(storage).then((pref) => {
      setSubIndex(resolveSubtitleIndex(textSubtitles(subtitleTracks), pref));
    });
  }, [storage, subtitleTracks]);

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

  useEffect(() => {
    let cancelled = false;
    void client.sessionHeaders().then((next) => {
      if (cancelled) return;
      setHeaders({ ...next, "User-Agent": userAgent });
    });
    return () => {
      cancelled = true;
    };
  }, [client, userAgent]);

  const origin = client.baseUrl || "http://localhost";
  const uri = absoluteUrl(source.delivery.url, origin);
  const knownDuration = duration > 0 ? duration : source.durationSeconds ?? 0;
  const seekCap = seekCapForSource(source, knownDuration);
  positionRef.current = position;
  seekCapRef.current = seekCap;

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
      report(
        "start",
        source.startPositionSeconds && source.startPositionSeconds > 30
          ? source.startPositionSeconds
          : 0,
      );
    }
    const id = setInterval(() => report("progress", position, paused), 10_000);
    return () => {
      clearInterval(id);
      report("stopped", position, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.itemId, source.playSessionId, identity?.tmdbId]);

  // Netflix-style keyboard: Space play/pause; ←/→ skip 10s; hold arrow to keep seeking.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let holdKey: "ArrowLeft" | "ArrowRight" | null = null;
    let holdDelay: ReturnType<typeof setTimeout> | null = null;
    let holdInterval: ReturnType<typeof setInterval> | null = null;

    const clearHold = () => {
      if (holdDelay) clearTimeout(holdDelay);
      if (holdInterval) clearInterval(holdInterval);
      holdDelay = null;
      holdInterval = null;
      holdKey = null;
    };

    const startHold = (key: "ArrowLeft" | "ArrowRight", delta: number) => {
      clearHold();
      holdKey = key;
      skipBy(delta);
      holdDelay = setTimeout(() => {
        holdInterval = setInterval(() => skipBy(delta), SEEK_HOLD_INTERVAL_MS);
      }, SEEK_HOLD_DELAY_MS);
    };

    const isTypingTarget = (t: EventTarget | null) => {
      if (!t || typeof t !== "object") return false;
      const el = t as { tagName?: string; isContentEditable?: boolean };
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        togglePause();
        return;
      }

      if (!isLive && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (e.repeat || holdKey === e.key) return;
        startHold(e.key, e.key === "ArrowLeft" ? -SKIP_S : SKIP_S);
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
        return;
      }

      if (e.key === "Escape" || e.key === "BrowserBack") {
        e.preventDefault();
        if (transportRef.current?.isFullscreen()) {
          void transportRef.current.exitFullscreen();
          return;
        }
        onClose();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (holdKey === e.key) clearHold();
      }
    };

    const onBlur = () => clearHold();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      clearHold();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, onClose, skipBy, togglePause]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    transportRef.current?.setMuted(next);
    reveal();
  }, [muted, reveal]);

  const toggleFullscreen = useCallback(async () => {
    const t = transportRef.current;
    if (!t) return;
    if (t.isFullscreen()) await t.exitFullscreen();
    else await t.requestFullscreen();
    setFullscreen(t.isFullscreen());
    reveal();
  }, [reveal]);

  const applyRate = useCallback(
    (next: number) => {
      setRate(next);
      transportRef.current?.setRate(next);
      setMenu("none");
      reveal();
    },
    [reveal],
  );

  const zap = async (dir: 1 | -1) => {
    if (!liveZapEnabled) return;
    const list = params.liveChannels ?? [];
    if (!list.length || !params.channelUuid) return;
    const idx = list.findIndex((c) => c.uuid === params.channelUuid);
    const next = list[(idx + dir + list.length) % list.length];
    if (!next) return;
    const data = await playLiveChannel(next.uuid);
    onReplaceParams({
      source: data.source,
      title: data.title ?? next.name,
      live: true,
      channelUuid: next.uuid,
      liveChannels: list,
    });
  };

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidthRef.current = e.nativeEvent.layout.width;
  };

  const onBarPress = (e: GestureResponderEvent) => {
    const w = barWidthRef.current;
    if (w <= 0) return;
    const x = e.nativeEvent.locationX;
    seekToRatio(Math.min(1, Math.max(0, x / w)));
  };

  const progressRatio =
    !isLive && knownDuration > 0 ? Math.min(1, Math.max(0, position / knownDuration)) : 0;
  const remainingLabel =
    isLive ? "LIVE" : knownDuration > 0 ? formatTime(Math.max(0, knownDuration - position)) : formatTime(position);

  return (
    <Pressable
      style={styles.root}
      {...(Platform.OS === "web" ? ({ "data-player-root": "1" } as Record<string, string>) : {})}
      onPress={() => {
        if (menu !== "none") {
          setMenu("none");
          reveal();
          return;
        }
        if (controls) setControls(false);
        else reveal();
      }}
    >
      {headers ? (
        <VideoSurface
          source={source}
          uri={uri}
          headers={headers}
          paused={paused}
          isLive={isLive}
          startPositionSeconds={source.startPositionSeconds}
          subtitleIndex={subIndex}
          subtitleTracks={subtitleTracks}
          onProgress={({ currentTime, duration: d }) => {
            setPosition(currentTime);
            if (d && d > 0) setDuration(d);
          }}
          onLoad={({ duration: d }) => {
            setDuration(d > 0 ? d : knownDuration);
            const start = source.startPositionSeconds ?? 0;
            if (start > 30 && !isLive) {
              seekFn.current?.(start);
              setPosition(start);
            }
          }}
          onEnd={onClose}
          onError={setError}
          onSeekRequest={(seek) => {
            seekFn.current = seek;
          }}
          onTransportReady={(t) => {
            transportRef.current = t;
            t.setMuted(muted);
            t.setRate(rate);
          }}
        />
      ) : null}

      {controls ? (
        <View style={styles.chrome} pointerEvents="box-none">
          {/* Top: back (left) + report flag (right) */}
          <View style={styles.top} pointerEvents="box-none">
            <IconButton onPress={onClose} label="Back">
              <NfBackIcon size={28} />
            </IconButton>
            <View style={styles.topRight}>
              {isLive ? (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : null}
              <IconButton onPress={() => reveal(true)} label="Report a problem">
                <NfFlagIcon size={26} />
              </IconButton>
            </View>
          </View>

          {/* Bottom: progress + control row */}
          <View style={styles.bottom} pointerEvents="box-none">
            {!isLive ? (
              <View style={styles.progressRow}>
                <Pressable
                  style={styles.barHit}
                  onLayout={onBarLayout}
                  onPress={onBarPress}
                  accessibilityLabel="Seek"
                >
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${progressRatio * 100}%` }]} />
                    <View
                      style={[
                        styles.scrubber,
                        { left: `${progressRatio * 100}%` },
                      ]}
                    />
                  </View>
                </Pressable>
                <Text style={styles.time}>{remainingLabel}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.leftActions}>
                <IconButton onPress={togglePause} label={paused ? "Play" : "Pause"}>
                  {paused ? <NfPlayIcon size={28} /> : <NfPauseIcon size={28} />}
                </IconButton>
                {!isLive ? (
                  <>
                    <IconButton onPress={() => skipBy(-SKIP_S)} label="Back 10 seconds">
                      <NfRewind10Icon size={30} />
                    </IconButton>
                    <IconButton onPress={() => skipBy(SKIP_S)} label="Forward 10 seconds">
                      <NfForward10Icon size={30} />
                    </IconButton>
                  </>
                ) : null}
                <IconButton onPress={toggleMute} label={muted ? "Unmute" : "Mute"}>
                  <NfVolumeIcon size={28} muted={muted} />
                </IconButton>
                {isLive && liveZapEnabled ? (
                  <>
                    <IconButton onPress={() => void zap(-1)} label="Previous channel">
                      <Text style={styles.chLabel}>Ch-</Text>
                    </IconButton>
                    <IconButton onPress={() => void zap(1)} label="Next channel">
                      <Text style={styles.chLabel}>Ch+</Text>
                    </IconButton>
                  </>
                ) : null}
              </View>

              <Text style={styles.centerTitle} numberOfLines={1}>
                {params.title ?? "Playing"}
              </Text>

              <View style={styles.rightActions}>
                {!isLive ? (
                  <IconButton onPress={() => reveal()} label="Next episode">
                    <NfNextEpisodeIcon size={28} />
                  </IconButton>
                ) : null}
                {!isLive ? (
                  <IconButton onPress={() => reveal()} label="Episodes">
                    <NfEpisodesIcon size={28} />
                  </IconButton>
                ) : null}
                <IconButton
                  onPress={() => setMenu((m) => (m === "subs" ? "none" : "subs"))}
                  label="Audio and subtitles"
                >
                  <NfAudioSubsIcon size={28} />
                </IconButton>
                <IconButton
                  onPress={() => setMenu((m) => (m === "speed" ? "none" : "speed"))}
                  label="Playback speed"
                >
                  <NfSpeedIcon size={28} />
                </IconButton>
                <IconButton
                  onPress={() => void toggleFullscreen()}
                  label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  <NfFullscreenIcon size={26} exit={fullscreen} />
                </IconButton>
              </View>
            </View>

            {menu === "subs" ? (
              <View style={styles.menu}>
                <Text style={styles.menuHeading}>Subtitles</Text>
                <Pressable
                  onPress={() => {
                    setSubIndex(null);
                    void saveSubtitleOff(storage);
                    setMenu("none");
                  }}
                >
                  <Text style={[styles.menuItem, subIndex === null && styles.menuItemActive]}>Off</Text>
                </Pressable>
                {textSubtitles(subtitleTracks).map((t, i) => (
                  <Pressable
                    key={`${t.language}-${i}`}
                    onPress={() => {
                      setSubIndex(i);
                      void saveSubtitleTrack(t, storage);
                      setMenu("none");
                    }}
                  >
                    <Text style={[styles.menuItem, subIndex === i && styles.menuItemActive]}>
                      {t.label || t.language || `Track ${i + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {menu === "speed" ? (
              <View style={styles.menu}>
                <Text style={styles.menuHeading}>Playback speed</Text>
                {RATES.map((r) => (
                  <Pressable key={r} onPress={() => applyRate(r)}>
                    <Text style={[styles.menuItem, rate === r && styles.menuItemActive]}>
                      {r === 1 ? "Normal" : `${r}x`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.errorClose}>Close</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const NETFLIX_RED = "#e50914";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  chrome: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    // Soft fade like Netflix top gradient
    backgroundColor: "transparent",
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  liveBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  bottom: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 28,
    backgroundColor: "transparent",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  barHit: {
    flex: 1,
    height: 20,
    justifyContent: "center",
  },
  barTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  barFill: {
    height: 3,
    backgroundColor: NETFLIX_RED,
    borderRadius: 2,
  },
  scrubber: {
    position: "absolute",
    top: -5,
    marginLeft: -6.5,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: NETFLIX_RED,
  },
  time: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    minWidth: 48,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    flexShrink: 0,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    flexShrink: 0,
  },
  centerTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  iconBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    minHeight: 36,
  },
  chLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  menu: {
    marginTop: 12,
    alignSelf: "flex-end",
    backgroundColor: "rgba(20,20,20,0.95)",
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 180,
    gap: 4,
  },
  menuHeading: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  menuItem: { color: "#fff", fontSize: 15, paddingVertical: 6 },
  menuItemActive: { color: NETFLIX_RED, fontWeight: "700" },
  errorBox: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    gap: 16,
    padding: 24,
  },
  errorText: { color: colors.danger, fontSize: 16, textAlign: "center" },
  errorClose: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
