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
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import type { KeyValueStorage } from "@streamerr/client";
import {
  getClient,
  isIptvProgressSource,
  listPlaybackSubtitles,
  loadSubtitlePref,
  playbackMediaUrl,
  playLiveChannel,
  reportIptvProgress,
  reportProgress,
  resolvePlaybackForPlay,
  resolveSubtitleIndex,
  saveSubtitleOff,
  saveSubtitleTrack,
  seekCapForSource,
  seriesEpisodes,
  SESSION_HEADER,
  textSubtitles,
} from "@streamerr/client";
import type { EpisodeListItem, MediaIdentity, PlaybackSource, SubtitleTrack } from "@streamerr/shared";
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
  /** Fired as playback advances — used to persist reload resume offsets. */
  onPositionSeconds?: (seconds: number) => void;
  /** Safe-area padding so chrome clears notch / home indicator (mobile landscape). */
  chromeInsets?: { top?: number; bottom?: number; left?: number; right?: number };
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
  large,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e?.stopPropagation?.();
        onPress();
      }}
      style={[styles.iconBtn, large && styles.iconBtnLarge]}
      accessibilityLabel={label}
      hitSlop={10}
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
  onPositionSeconds,
  chromeInsets,
}: PlayerScreenProps) {
  const insetTop = chromeInsets?.top ?? 0;
  const insetBottom = chromeInsets?.bottom ?? 0;
  const insetLeft = chromeInsets?.left ?? 0;
  const insetRight = chromeInsets?.right ?? 0;
  const [source, setSource] = useState<PlaybackSource>(params.source);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(source.durationSeconds ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(source.subtitles ?? []);
  const [menu, setMenu] = useState<"none" | "subs" | "speed" | "episodes">("none");
  const [episodeItems, setEpisodeItems] = useState<EpisodeListItem[]>([]);
  const [episodeSeasons, setEpisodeSeasons] = useState<number[]>([]);
  const [episodeSeason, setEpisodeSeason] = useState<number | null>(null);
  const [episodeBusy, setEpisodeBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Hover preview time (seconds) over the scrub bar — web pointer only. */
  const [scrubHover, setScrubHover] = useState<number | null>(null);
  const [barHovered, setBarHovered] = useState(false);
  const seekFn = useRef<((seconds: number) => void) | null>(null);
  const transportRef = useRef<VideoTransport | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressStarted = useRef(false);
  /** Ignore spurious native onEnd before real playback (common on iOS HLS load failures). */
  const playbackEverProgressed = useRef(false);
  const mediaLoaded = useRef(false);
  const resumeApplied = useRef(false);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);
  const seekCapRef = useRef(Infinity);
  const barWidthRef = useRef(0);
  const barElRef = useRef<View>(null);
  const knownDurationRef = useRef(0);
  const client = getClient();
  const isLive = Boolean(params.live);
  const identity = params.identity;
  const seriesTmdbId =
    identity?.mediaType === "episode" || identity?.mediaType === "tv"
      ? identity.tmdbId
      : undefined;
  const isEpisodePlayback = identity?.mediaType === "episode" && seriesTmdbId != null;

  const reveal = useCallback((keep = false) => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Keep chrome up until media actually moves — otherwise failed loads look like a black screen.
    if (!keep && playbackEverProgressed.current) {
      hideTimer.current = setTimeout(() => setControls(false), HIDE_MS);
    }
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
      const dur = knownDurationRef.current;
      if (!(dur > 0) || !Number.isFinite(dur)) return;
      const cap = seekCapRef.current;
      const max = Number.isFinite(cap) ? Math.min(cap, dur) : dur;
      if (!(max > 0)) return;
      const next = Math.max(0, Math.min(max, ratio * max));
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
    playbackEverProgressed.current = false;
    mediaLoaded.current = false;
    resumeApplied.current = false;
    setError(null);
  }, [params.source]);

  const applyResumeSeek = useCallback(
    (dur: number) => {
      if (resumeApplied.current || isLive) return;
      const start = source.startPositionSeconds ?? 0;
      if (!(start > 30) || !(dur > 0) || !Number.isFinite(dur)) return;
      // Never seek to/past EOF — that fires onEnd before any progress on iOS HLS.
      if (start >= dur - 15) {
        resumeApplied.current = true;
        return;
      }
      const capped = Math.min(start, Math.max(0, dur - 15));
      if (!(capped > 30)) {
        resumeApplied.current = true;
        return;
      }
      resumeApplied.current = true;
      seekFn.current?.(capped);
      positionRef.current = capped;
      setPosition(capped);
    },
    [isLive, source.startPositionSeconds],
  );

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
    void client
      .sessionHeaders()
      .then((next) => {
        if (cancelled) return;
        const sid = next[SESSION_HEADER] ?? null;
        setSessionId(sid);
        setHeaders({ ...next, "User-Agent": userAgent });
        // Web often relies on the session cookie (credentials: include) without an
        // in-memory id. Native needs the header/query session for MPEG-TS / HLS.
        if (!sid && typeof document === "undefined") {
          setError("Not signed in — session missing for playback");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setHeaders({ "User-Agent": userAgent });
        setError((err as Error).message || "Failed to load playback session");
      });
    return () => {
      cancelled = true;
    };
  }, [client, userAgent]);

  const origin = client.baseUrl || "http://localhost";
  const uri = playbackMediaUrl(source.delivery.url, origin, sessionId);
  // Prefer a finite player-reported duration; fall back to catalogue metadata.
  // MSE/HLS sometimes reports Infinity — that must not wipe the scrubber.
  const knownDuration = (() => {
    const fromPlayer = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const fromSource =
      source.durationSeconds != null &&
      Number.isFinite(source.durationSeconds) &&
      source.durationSeconds > 0
        ? source.durationSeconds
        : 0;
    return fromPlayer > 0 ? fromPlayer : fromSource;
  })();
  const seekCap = seekCapForSource(source, knownDuration);
  positionRef.current = position;
  pausedRef.current = paused;
  seekCapRef.current = seekCap;
  knownDurationRef.current = knownDuration;

  const report = useCallback(
    (event: "start" | "progress" | "stopped", seconds: number, pausedNow?: boolean) => {
      onPositionSeconds?.(seconds);
      // Jellyfin Sessions/Playing* only applies to Jellyfin streams. Cache/IPTV
      // must use iptv-progress — calling Sessions with a stale/foreign itemId
      // 500s every 5s and floods the API log.
      if (source.provider === "jellyfin" && source.itemId) {
        void reportProgress({
          itemId: source.itemId,
          positionSeconds: seconds,
          event,
          playSessionId: source.playSessionId,
          mediaSourceId: source.mediaSourceId,
          playMethod: source.playMethod,
          isPaused: pausedNow,
          identity,
          durationSeconds: knownDuration > 0 ? knownDuration : undefined,
          title: params.title,
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
    [identity, isLive, knownDuration, onPositionSeconds, params.title, source],
  );

  // Netflix-style: persist position ~every 5s from live refs (not a stale closure).
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
    const id = setInterval(() => {
      report("progress", positionRef.current, pausedRef.current);
    }, 5_000);
    return () => {
      clearInterval(id);
      report("stopped", positionRef.current, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.itemId, source.playSessionId, identity?.tmdbId]);

  // Netflix-style keyboard: Space play/pause; ←/→ skip 10s; hold arrow to keep seeking.
  // RN has a `window` global but no DOM addEventListener — web only.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window?.addEventListener !== "function") return;

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
    const data = await playLiveChannel(next.uuid, { hls: Platform.OS === "ios" });
    onReplaceParams({
      source: data.source,
      title: data.title ?? next.name,
      live: true,
      channelUuid: next.uuid,
      liveChannels: list,
    });
  };

  const loadEpisodes = useCallback(async () => {
    if (!seriesTmdbId) return;
    try {
      const data = await seriesEpisodes(seriesTmdbId);
      setEpisodeItems(data.items);
      setEpisodeSeasons(data.seasons);
      const curSeason = identity?.seasonNumber ?? data.seasons[0] ?? null;
      setEpisodeSeason(curSeason);
    } catch {
      setEpisodeItems([]);
      setEpisodeSeasons([]);
    }
  }, [seriesTmdbId, identity?.seasonNumber]);

  const playEpisodeItem = useCallback(
    async (ep: EpisodeListItem) => {
      if (episodeBusy) return;
      setEpisodeBusy(true);
      setError(null);
      try {
        const nextSource = await resolvePlaybackForPlay(ep.identity, {
          meta: { runtimeMinutes: ep.runtimeMinutes },
        });
        setMenu("none");
        onReplaceParams({
          source: nextSource,
          title: ep.title,
          identity: ep.identity,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not play episode");
      } finally {
        setEpisodeBusy(false);
      }
    },
    [episodeBusy, onReplaceParams],
  );

  const playNextEpisode = useCallback(async () => {
    if (!isEpisodePlayback || !seriesTmdbId || episodeBusy) return;
    reveal(true);
    setEpisodeBusy(true);
    setError(null);
    try {
      let items = episodeItems;
      if (!items.length) {
        const data = await seriesEpisodes(seriesTmdbId);
        items = data.items;
        setEpisodeItems(items);
        setEpisodeSeasons(data.seasons);
      }
      const s = identity?.seasonNumber;
      const e = identity?.episodeNumber;
      if (s == null || e == null) return;
      const idx = items.findIndex((ep) => ep.seasonNumber === s && ep.episodeNumber === e);
      const next =
        (idx >= 0 ? items[idx + 1] : null) ??
        items.find((ep) => ep.seasonNumber === s && ep.episodeNumber === e + 1) ??
        items.find((ep) => ep.seasonNumber === s + 1 && ep.episodeNumber === 1);
      if (!next) {
        setError("No next episode");
        setEpisodeBusy(false);
        return;
      }
      // playEpisodeItem owns busy flag from here.
      setEpisodeBusy(false);
      await playEpisodeItem(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play next episode");
      setEpisodeBusy(false);
    }
  }, [
    episodeBusy,
    episodeItems,
    identity?.episodeNumber,
    identity?.seasonNumber,
    isEpisodePlayback,
    playEpisodeItem,
    reveal,
    seriesTmdbId,
  ]);

  const openEpisodesMenu = useCallback(() => {
    if (!isEpisodePlayback) return;
    setMenu((m) => (m === "episodes" ? "none" : "episodes"));
    reveal(true);
    void loadEpisodes();
  }, [isEpisodePlayback, loadEpisodes, reveal]);

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidthRef.current = e.nativeEvent.layout.width;
  };

  const barDomRect = useCallback((): DOMRect | null => {
    const node = barElRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    return node.getBoundingClientRect();
  }, []);

  const ratioFromClientX = useCallback(
    (clientX: number) => {
      const rect = barDomRect();
      const width = rect && rect.width > 0 ? rect.width : barWidthRef.current;
      if (!(width > 0)) return null;
      if (rect) barWidthRef.current = rect.width;
      const left = rect?.left ?? 0;
      return Math.min(1, Math.max(0, (clientX - left) / width));
    },
    [barDomRect],
  );

  const onBarPress = (e: GestureResponderEvent) => {
    e?.stopPropagation?.();
    if (Platform.OS === "web") {
      const ne = e.nativeEvent as GestureResponderEvent["nativeEvent"] & {
        clientX?: number;
        pageX?: number;
      };
      const clientX = typeof ne.clientX === "number" ? ne.clientX : ne.pageX;
      if (typeof clientX === "number") {
        const ratio = ratioFromClientX(clientX);
        if (ratio != null) {
          seekToRatio(ratio);
          return;
        }
      }
    }
    const w = barWidthRef.current;
    if (w <= 0) return;
    seekToRatio(Math.min(1, Math.max(0, e.nativeEvent.locationX / w)));
  };

  const setHoverFromRatio = useCallback((ratio: number) => {
    const dur = knownDurationRef.current;
    if (!(dur > 0) || !Number.isFinite(dur)) {
      setScrubHover(null);
      return;
    }
    setScrubHover(Math.min(1, Math.max(0, ratio)) * dur);
  }, []);

  const clearScrubHover = useCallback(() => {
    setScrubHover(null);
    setBarHovered(false);
  }, []);

  /** Web mouse handlers — RN-web forwards these on Pressable. */
  const webBarHoverProps =
    Platform.OS === "web"
      ? ({
          onMouseMove: (e: { clientX: number }) => {
            const ratio = ratioFromClientX(e.clientX);
            if (ratio == null) return;
            setBarHovered(true);
            setHoverFromRatio(ratio);
          },
          onMouseLeave: clearScrubHover,
        } as Record<string, unknown>)
      : {};

  const progressRatio =
    !isLive && knownDuration > 0 ? Math.min(1, Math.max(0, position / knownDuration)) : 0;
  const remainingLabel =
    isLive ? "LIVE" : knownDuration > 0 ? formatTime(Math.max(0, knownDuration - position)) : formatTime(position);
  const scrubTipRatio =
    scrubHover !== null && knownDuration > 0 ? Math.min(1, Math.max(0, scrubHover / knownDuration)) : null;

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
      {headers && (Platform.OS === "web" || sessionId || !source.hls) ? (
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
            if (currentTime > 0.25 && !playbackEverProgressed.current) {
              playbackEverProgressed.current = true;
              reveal();
            }
            setPosition(currentTime);
            onPositionSeconds?.(currentTime);
            if (typeof d === "number" && Number.isFinite(d) && d > 0) {
              setDuration(d);
              applyResumeSeek(d);
            }
          }}
          onLoad={({ duration: d }) => {
            mediaLoaded.current = true;
            const dur =
              typeof d === "number" && Number.isFinite(d) && d > 0
                ? d
                : knownDuration > 0
                  ? knownDuration
                  : 0;
            if (dur > 0) setDuration(dur);
            // Only resume once we know duration — seeking with dur=0 EOF-kills iOS HLS.
            applyResumeSeek(dur);
          }}
          onEnd={() => {
            // Spurious onEnd before load/progress (bad seek, auth fail treated as EOF).
            if (!playbackEverProgressed.current && !isLive) {
              setError((prev) => {
                if (prev) return prev;
                const host = (() => {
                  try {
                    return new URL(uri).host;
                  } catch {
                    return "?";
                  }
                })();
                if (!mediaLoaded.current) {
                  return `Stream failed to load from ${host}. Is the API URL reachable from this phone?`;
                }
                return `Playback stopped before it started (${host}). Try Play again from the beginning.`;
              });
              return;
            }
            onClose();
          }}
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

      {!headers ? (
        <View style={styles.loadingBox} pointerEvents="none">
          <Text style={styles.loadingText}>Loading stream…</Text>
        </View>
      ) : null}

      {/* Persistent back — Netflix keeps this reachable while chrome auto-hides. */}
      <View
        style={[
          styles.alwaysBack,
          { paddingTop: 8 + insetTop, paddingLeft: 8 + insetLeft },
        ]}
        pointerEvents="box-none"
      >
        <IconButton onPress={onClose} label="Back" large>
          <NfBackIcon size={32} />
        </IconButton>
      </View>

      {controls && !error ? (
        <View style={styles.chrome} pointerEvents="box-none">
          <View style={styles.topGradient} pointerEvents="none" />
          <View style={styles.bottomGradient} pointerEvents="none" />

          <View
            style={[
              styles.top,
              {
                paddingTop: 8 + insetTop,
                paddingRight: 16 + insetRight,
                paddingLeft: 56 + insetLeft,
              },
            ]}
          >
            <Text style={styles.topTitle} numberOfLines={1}>
              {params.title ?? ""}
            </Text>
            <View style={styles.topRight}>
              {isLive ? (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : null}
              <IconButton onPress={() => reveal(true)} label="Report a problem">
                <NfFlagIcon size={24} />
              </IconButton>
            </View>
          </View>

          <View style={styles.centerPlay} pointerEvents="box-none">
            <IconButton onPress={togglePause} label={paused ? "Play" : "Pause"} large>
              <View style={styles.centerPlayHit}>
                {paused ? <NfPlayIcon size={40} /> : <NfPauseIcon size={40} />}
              </View>
            </IconButton>
          </View>

          <Pressable
            style={[
              styles.bottom,
              {
                paddingBottom: 16 + insetBottom,
                paddingLeft: 20 + insetLeft,
                paddingRight: 20 + insetRight,
              },
            ]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            {!isLive ? (
              <View style={styles.progressRow}>
                <View
                  ref={barElRef}
                  style={styles.barHit}
                  onLayout={onBarLayout}
                  {...webBarHoverProps}
                >
                  {scrubTipRatio !== null && scrubHover !== null ? (
                    <View
                      style={[
                        styles.scrubTip,
                        { left: `${scrubTipRatio * 100}%` },
                        Platform.OS === "web"
                          ? ({ transform: "translate(-50%, calc(-100% - 6px))" } as object)
                          : null,
                      ]}
                    >
                      <Text style={styles.scrubTipText}>{formatTime(scrubHover)}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.barPress}
                    onPress={onBarPress}
                    accessibilityLabel="Seek"
                  >
                    <View style={[styles.barTrack, barHovered && styles.barTrackHot]}>
                      <View
                        style={[
                          styles.barFill,
                          barHovered && styles.barFillHot,
                          { width: `${progressRatio * 100}%` },
                        ]}
                      />
                      <View
                        style={[
                          styles.scrubber,
                          barHovered && styles.scrubberHot,
                          { left: `${progressRatio * 100}%` },
                        ]}
                      />
                    </View>
                  </Pressable>
                </View>
                <Text style={styles.time}>{remainingLabel}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.leftActions}>
                <IconButton onPress={togglePause} label={paused ? "Play" : "Pause"}>
                  {paused ? <NfPlayIcon size={30} /> : <NfPauseIcon size={30} />}
                </IconButton>
                {!isLive ? (
                  <>
                    <IconButton onPress={() => skipBy(-SKIP_S)} label="Back 10 seconds">
                      <NfRewind10Icon size={34} />
                    </IconButton>
                    <IconButton onPress={() => skipBy(SKIP_S)} label="Forward 10 seconds">
                      <NfForward10Icon size={34} />
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

              <View style={styles.rightActions}>
                {isEpisodePlayback ? (
                  <IconButton
                    onPress={() => void playNextEpisode()}
                    label={episodeBusy ? "Loading next episode" : "Next episode"}
                  >
                    <NfNextEpisodeIcon size={28} />
                  </IconButton>
                ) : null}
                {isEpisodePlayback ? (
                  <IconButton onPress={openEpisodesMenu} label="Episodes">
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
                {Platform.OS === "web" ? (
                  <IconButton
                    onPress={() => void toggleFullscreen()}
                    label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    <NfFullscreenIcon size={26} exit={fullscreen} />
                  </IconButton>
                ) : null}
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

            {menu === "episodes" ? (
              <View style={[styles.menu, styles.episodesMenu]}>
                <Text style={styles.menuHeading}>Episodes</Text>
                {episodeSeasons.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonRow}>
                    {episodeSeasons.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setEpisodeSeason(s)}
                        style={[styles.seasonPill, episodeSeason === s && styles.seasonPillActive]}
                      >
                        <Text
                          style={[
                            styles.seasonPillText,
                            episodeSeason === s && styles.seasonPillTextActive,
                          ]}
                        >
                          Season {s}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                <ScrollView style={styles.episodeList} showsVerticalScrollIndicator={false}>
                  {episodeItems
                    .filter((ep) => episodeSeason == null || ep.seasonNumber === episodeSeason)
                    .map((ep) => {
                      const current =
                        ep.seasonNumber === identity?.seasonNumber &&
                        ep.episodeNumber === identity?.episodeNumber;
                      return (
                        <Pressable
                          key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                          disabled={episodeBusy}
                          onPress={() => void playEpisodeItem(ep)}
                          style={styles.episodeRow}
                        >
                          <Text
                            style={[styles.menuItem, current && styles.menuItemActive]}
                            numberOfLines={1}
                          >
                            {ep.episodeNumber}. {ep.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  {!episodeItems.length ? (
                    <Text style={styles.menuItem}>Loading episodes…</Text>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onClose} style={styles.errorCloseBtn}>
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
    pointerEvents: "box-none",
    zIndex: 5,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  alwaysBack: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 8,
  },
  centerPlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6,
  },
  centerPlayHit: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingBottom: 24,
    gap: 16,
    pointerEvents: "box-none",
    zIndex: 2,
  },
  topTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  bottom: {
    paddingTop: 12,
    pointerEvents: "box-none",
    zIndex: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
    overflow: "visible",
  },
  barHit: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  barPress: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
  },
  barTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  barTrackHot: {
    height: 5,
  },
  barFill: {
    height: 3,
    backgroundColor: NETFLIX_RED,
    borderRadius: 2,
    pointerEvents: "none",
  },
  barFillHot: {
    height: 5,
  },
  scrubber: {
    position: "absolute",
    top: "50%",
    marginTop: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: NETFLIX_RED,
    pointerEvents: "none",
  },
  scrubberHot: {
    width: 16,
    height: 16,
    marginTop: -8,
    marginLeft: -8,
    borderRadius: 8,
  },
  scrubTip: {
    position: "absolute",
    top: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    zIndex: 4,
    minWidth: 52,
    alignItems: "center",
    pointerEvents: "none",
  },
  scrubTipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  time: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    minWidth: 52,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
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
    marginLeft: "auto",
  },
  iconBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
    minHeight: 40,
  },
  iconBtnLarge: {
    minWidth: 48,
    minHeight: 48,
    padding: 8,
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
  episodesMenu: { minWidth: 280, maxWidth: 360, maxHeight: 280 },
  seasonRow: { marginBottom: 8, maxHeight: 36 },
  seasonPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginRight: 8,
  },
  seasonPillActive: { backgroundColor: "#fff" },
  seasonPillText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  seasonPillTextActive: { color: "#000" },
  episodeList: { maxHeight: 180 },
  episodeRow: { paddingVertical: 2 },
  loadingBox: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorBox: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.82)",
    gap: 20,
    padding: 24,
    zIndex: 20,
  },
  errorText: { color: colors.danger, fontSize: 16, textAlign: "center", maxWidth: 420 },
  errorCloseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  errorClose: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
