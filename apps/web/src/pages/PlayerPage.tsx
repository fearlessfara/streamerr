import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import type { MediaIdentity, PlaybackSource, SubtitleTrack } from "@streamerr/shared";
import { parseSubtitleCues, type SubtitleCue } from "@streamerr/shared";
import { Button } from "@streamerr/ui";
import { getAcquisition, playLiveChannel, reportIptvProgress, reportProgress } from "../lib/api";
import {
  resolveSubtitleIndex,
  saveSubtitleOff,
  saveSubtitleTrack,
} from "../lib/subtitle-pref";

interface LiveChannelRef {
  uuid: string;
  name: string;
  number?: number;
}

interface PlayState {
  source: PlaybackSource;
  title?: string;
  live?: boolean;
  identity?: MediaIdentity;
  channelUuid?: string;
  liveChannels?: LiveChannelRef[];
}

/** Seconds behind the live edge before we treat playback as "not live". */
const LIVE_BEHIND_THRESHOLD = 8;

const HIDE_MS = 3000;
const SKIP_S = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * fMP4 remux (`frag_keyframe+empty_moov`) never exposes real runtime.
 * Browsers report Infinity or a growing buffered length (e.g. 0:13) — that
 * makes the scrubber look "live". Prefer catalogue duration whenever we have it.
 */
function finiteDuration(
  mediaDuration: number,
  catalogueDuration = 0,
  preferCatalogue = false,
): number {
  if (preferCatalogue && catalogueDuration > 0) return catalogueDuration;
  if (catalogueDuration > 0) {
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return catalogueDuration;
    // Buffered length masquerading as duration (common for progressive remux).
    if (mediaDuration < catalogueDuration * 0.85) return catalogueDuration;
  }
  if (Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration;
  return catalogueDuration > 0 ? catalogueDuration : 0;
}

function isRemuxVodUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("/playback/dispatcharr/vod/") || url.includes("/playback/cache/");
}

function getLiveEdge(video: HTMLVideoElement): number {
  try {
    if (video.seekable.length > 0) {
      return video.seekable.end(video.seekable.length - 1);
    }
  } catch {
    /* ignore */
  }
  try {
    if (video.buffered.length > 0) {
      return video.buffered.end(video.buffered.length - 1);
    }
  } catch {
    /* ignore */
  }
  return video.currentTime;
}

function LiveBadge({
  behind = 0,
  onGoLive,
  className = "",
}: {
  behind?: number;
  onGoLive?: () => void;
  className?: string;
}) {
  const isBehind = behind >= LIVE_BEHIND_THRESHOLD;
  const classes = `player-live-badge${isBehind ? " is-behind" : ""}${className ? ` ${className}` : ""}`;

  if (isBehind && onGoLive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onGoLive}
        aria-label={`Go to live, ${formatTime(behind)} behind`}
        title="Go to live"
      >
        <span className="player-live-dot" aria-hidden="true" />
        LIVE
        <span className="player-live-behind">-{formatTime(behind)}</span>
      </button>
    );
  }

  return (
    <span className={classes} aria-label="Live">
      <span className="player-live-dot" aria-hidden="true" />
      LIVE
    </span>
  );
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  );
}

function IconSkip({ dir }: { dir: "back" | "forward" }) {
  const back = dir === "back";

  return (
    <span className={`player-skip-icon player-skip-${dir}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="32" height="32">
        {/* Ring + tip share one transform so forward is a clean mirror. */}
        <g transform={back ? undefined : "translate(40 0) scale(-1 1)"}>
          <circle
            cx="20"
            cy="22"
            r="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="66 9.4"
            strokeDashoffset="19"
          />
          <path d="M20 7 L20 12.8 L15.2 9.9 Z" fill="currentColor" />
        </g>
      </svg>
      {/* CSS-centered so we never fight SVG text baselines again. */}
      <span className="player-skip-label">10</span>
    </span>
  );
}

function IconVolume({ muted, level }: { muted: boolean; level: number }) {
  if (muted || level === 0) {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"
        />
      </svg>
    );
  }
  if (level < 0.5) {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7 9v6h4l5 5V4l-5 5H7zm8.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
      />
    </svg>
  );
}

function IconFullscreen({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path
          fill="currentColor"
          d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
      />
    </svg>
  );
}

function IconAudio() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"
      />
    </svg>
  );
}

function IconCc() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM7 15h3c.55 0 1-.45 1-1v-1H9.5v.5h-2v-3h2V11H11v-1c0-.55-.45-1-1-1H7c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm7 0h3c.55 0 1-.45 1-1v-1h-1.5v.5h-2v-3h2V11H18v-1c0-.55-.45-1-1-1h-3c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1z"
      />
    </svg>
  );
}

function textSubtitles(source: PlaybackSource | undefined): Array<SubtitleTrack & { url: string }> {
  return (source?.subtitles ?? []).filter(
    (track): track is SubtitleTrack & { url: string } => Boolean(track.url),
  );
}

export function PlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PlayState | null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<ReturnType<typeof mpegts.createPlayer> | null>(null);
  const hideTimer = useRef<number | null>(null);
  const remuxSeekTimer = useRef<number | null>(null);
  const volumeBeforeMute = useRef(1);
  /** Absolute timeline offset when remux restarts at `?start=` (fMP4 has no duration). */
  const remuxBaseRef = useRef(0);
  const sourceGenRef = useRef(0);
  const source = state?.source;
  const isLive =
    Boolean(state?.live) ||
    Boolean(source?.mimeType?.includes("mp2t")) ||
    Boolean(source?.delivery.url.includes("/playback/dispatcharr/live/"));
  const knownDuration = source?.durationSeconds ?? 0;
  const remuxVod = !isLive && isRemuxVodUrl(source?.delivery.url);

  const [downloadBytes, setDownloadBytes] = useState(source?.bytesDownloaded ?? 0);
  const [downloadTotal, setDownloadTotal] = useState(source?.totalBytes);
  const [downloadComplete, setDownloadComplete] = useState(
    Boolean(source?.downloadComplete),
  );

  const [controlsVisible, setControlsVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(knownDuration);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [scrubHover, setScrubHover] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [liveBehind, setLiveBehind] = useState(0);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [subsOpen, setSubsOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [zapping, setZapping] = useState(false);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const subsOpenRef = useRef(false);
  const audioOpenRef = useRef(false);
  const subsMenuRef = useRef<HTMLDivElement>(null);
  const audioMenuRef = useRef<HTMLDivElement>(null);
  subsOpenRef.current = subsOpen;
  audioOpenRef.current = audioOpen;

  useEffect(() => {
    const tracks = source?.audioTracks ?? [];
    if (!tracks.length || !source) {
      setAudioIndex(null);
      return;
    }
    const fromUrl = (() => {
      try {
        const u = new URL(source.delivery.url, window.location.origin);
        const raw = u.searchParams.get("audioStreamIndex");
        return raw != null ? Number(raw) : NaN;
      } catch {
        return NaN;
      }
    })();
    if (Number.isFinite(fromUrl) && tracks.some((t) => t.index === fromUrl)) {
      setAudioIndex(fromUrl);
      return;
    }
    setAudioIndex(tracks[0]!.index);
  }, [source, source?.delivery.url, source?.audioTracks]);
  const liveDriftRef = useRef<{
    pausedAtWall: number | null;
    behindAtPause: number;
    lastEdge: number;
  }>({ pausedAtWall: null, behindAtPause: 0, lastEdge: 0 });

  const revealControls = useCallback((sticky = false) => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (sticky || subsOpenRef.current || audioOpenRef.current) return;
    const video = videoRef.current;
    if (video && !video.paused) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), HIDE_MS);
    }
  }, []);

  const zapChannel = useCallback(
    async (delta: number) => {
      const list = state?.liveChannels ?? [];
      const currentUuid = state?.channelUuid;
      if (!isLive || list.length < 2 || !currentUuid || zapping) return;
      const idx = list.findIndex((c) => c.uuid === currentUuid);
      if (idx < 0) return;
      const next = list[(idx + delta + list.length) % list.length];
      if (!next) return;
      setZapping(true);
      try {
        const data = await playLiveChannel(next.uuid);
        navigate("/play", {
          replace: true,
          state: {
            source: data.source,
            title: data.title ?? next.name,
            live: true,
            channelUuid: next.uuid,
            liveChannels: list,
          } satisfies PlayState,
        });
      } catch (err) {
        console.warn("[live] channel zap failed", err);
      } finally {
        setZapping(false);
        revealControls();
      }
    },
    [isLive, navigate, revealControls, state?.channelUuid, state?.liveChannels, zapping],
  );

  const selectAudioTrack = useCallback(
    (index: number) => {
      if (!source || source.provider !== "jellyfin") return;
      try {
        const u = new URL(source.delivery.url, window.location.origin);
        u.searchParams.set("audioStreamIndex", String(index));
        const nextUrl = `${u.pathname}${u.search}`;
        setAudioIndex(index);
        setAudioOpen(false);
        navigate("/play", {
          replace: true,
          state: {
            ...state,
            source: {
              ...source,
              delivery: { ...source.delivery, url: nextUrl },
            },
          } satisfies PlayState,
        });
        revealControls();
      } catch (err) {
        console.warn("[player] audio switch failed", err);
      }
    },
    [navigate, revealControls, source, state],
  );

  const measureLiveBehind = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isLive) {
      setLiveBehind(0);
      return 0;
    }
    const edge = getLiveEdge(v);
    if (edge > liveDriftRef.current.lastEdge) {
      liveDriftRef.current.lastEdge = edge;
    }
    const bufferBehind = Math.max(0, (edge || liveDriftRef.current.lastEdge) - v.currentTime);
    let behind = bufferBehind;
    if (v.paused && liveDriftRef.current.pausedAtWall != null) {
      // Buffer may stop growing while paused — keep counting wall-clock drift.
      behind = Math.max(
        bufferBehind,
        liveDriftRef.current.behindAtPause +
          (Date.now() - liveDriftRef.current.pausedAtWall) / 1000,
      );
    }
    setLiveBehind(behind);
    return behind;
  }, [isLive]);

  const goLive = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isLive) return;
    const edge = getLiveEdge(v);
    const player = mpegtsRef.current;
    try {
      if (edge > v.currentTime + 0.4) {
        v.currentTime = Math.max(0, edge - 1);
      } else if (player) {
        player.unload();
        player.load();
      }
    } catch {
      /* ignore */
    }
    liveDriftRef.current.pausedAtWall = null;
    liveDriftRef.current.behindAtPause = 0;
    setLiveBehind(0);
    void v.play().catch(() => revealControls(true));
    revealControls();
  }, [isLive, revealControls]);

  const maxSeekableSeconds = useCallback(() => {
    if (downloadComplete || knownDuration <= 0) return knownDuration > 0 ? knownDuration : Infinity;
    if (downloadTotal && downloadTotal > 0 && downloadBytes > 0) {
      // Keep a margin so remux does not seek past downloaded bytes.
      return Math.max(0, (downloadBytes / downloadTotal) * knownDuration - 8);
    }
    return Math.max(30, knownDuration * 0.05);
  }, [downloadComplete, downloadBytes, downloadTotal, knownDuration]);

  const onSeek = useCallback(
    (value: number) => {
      const v = videoRef.current;
      if (!v || !source) return;
      const url = source.delivery.url;
      const isRemuxVod =
        !isLive &&
        (url.includes("/playback/dispatcharr/vod/") || url.includes("/playback/cache/"));
      const target = Math.max(0, value);
      const downloadCap = maxSeekableSeconds();
      const capped = Math.min(
        knownDuration > 0 ? Math.min(target, Math.max(0, knownDuration - 0.25)) : target,
        Number.isFinite(downloadCap) ? downloadCap : target,
      );

      if (isRemuxVod) {
        const local = capped - remuxBaseRef.current;
        let seekableEnd = 0;
        try {
          if (v.seekable.length > 0) seekableEnd = v.seekable.end(v.seekable.length - 1);
        } catch {
          /* ignore */
        }
        // Small moves inside the already-buffered remux window — no restart.
        if (local >= 0 && local <= seekableEnd - 0.35 && seekableEnd > 1) {
          v.currentTime = local;
          setCurrent(capped);
          revealControls();
          return;
        }

        // Restart remux at absolute offset (server input-seeks for start>0).
        try {
          const abs = new URL(url, window.location.origin);
          if (capped <= 0.5) abs.searchParams.delete("start");
          else abs.searchParams.set("start", String(Math.floor(capped)));
          const next =
            abs.origin === window.location.origin
              ? `${abs.pathname}${abs.search}`
              : abs.href;
          remuxBaseRef.current = capped <= 0.5 ? 0 : Math.floor(capped);
          const gen = sourceGenRef.current;
          // Drop the old stream first so max-connections=1 can accept the seek.
          v.removeAttribute("src");
          v.load();
          if (remuxSeekTimer.current != null) window.clearTimeout(remuxSeekTimer.current);
          remuxSeekTimer.current = window.setTimeout(() => {
            remuxSeekTimer.current = null;
            if (sourceGenRef.current !== gen) return;
            const el = videoRef.current;
            if (!el) return;
            el.src = next;
            void el.play().catch(() => revealControls(true));
          }, 40);
          setCurrent(capped);
          if (knownDuration > 0) setDuration(knownDuration);
          revealControls();
          return;
        } catch {
          /* fall through */
        }
      }

      remuxBaseRef.current = 0;
      v.currentTime = capped;
      setCurrent(capped);
      revealControls();
    },
    [revealControls, source, isLive, knownDuration, maxSeekableSeconds],
  );

  const skip = useCallback(
    (delta: number) => {
      if (isLive) {
        // Live: only allow catching up toward the edge (no rewind into missing history).
        if (delta <= 0) return;
        const v = videoRef.current;
        if (!v) return;
        const edge = getLiveEdge(v);
        v.currentTime = Math.min(edge, v.currentTime + delta);
        measureLiveBehind();
        revealControls();
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      const absolute = remuxBaseRef.current + v.currentTime;
      const cap = Math.min(
        knownDuration > 0 ? knownDuration : absolute + Math.max(0, delta),
        maxSeekableSeconds(),
      );
      onSeek(Math.min(Math.max(0, absolute + delta), cap));
    },
    [revealControls, isLive, measureLiveBehind, knownDuration, onSeek, maxSeekableSeconds],
  );

  useEffect(() => {
    const previous = document.title;
    const name = state?.title?.trim();
    document.title = name ? `${name} — Streamerr` : "Streamerr — Your media. One stream.";
    return () => {
      document.title = previous;
    };
  }, [state?.title]);

  useEffect(() => {
    setDownloadBytes(source?.bytesDownloaded ?? 0);
    setDownloadTotal(source?.totalBytes);
    setDownloadComplete(Boolean(source?.downloadComplete));
  }, [source?.acquisitionId, source?.bytesDownloaded, source?.totalBytes, source?.downloadComplete]);

  useEffect(() => {
    const id = source?.acquisitionId;
    if (!id || downloadComplete || source?.provider !== "cache") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { item } = await getAcquisition(id);
        if (cancelled) return;
        setDownloadBytes(item.bytesDownloaded);
        setDownloadTotal(item.totalBytes);
        if (item.state === "completed") setDownloadComplete(true);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [source?.acquisitionId, source?.provider, downloadComplete]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      liveDriftRef.current.pausedAtWall = null;
      void v.play();
    } else {
      const behind = measureLiveBehind();
      liveDriftRef.current.pausedAtWall = Date.now();
      liveDriftRef.current.behindAtPause = behind;
      v.pause();
    }
    revealControls();
  }, [revealControls, measureLiveBehind]);

  const unlockAudio = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = volumeBeforeMute.current || 1;
    setMuted(false);
    setVolume(v.volume);
    setNeedsUnmute(false);
    void v.play().catch(() => revealControls(true));
    revealControls();
  }, [revealControls]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      unlockAudio();
      return;
    }
    volumeBeforeMute.current = v.volume || 1;
    v.muted = true;
    setMuted(true);
    revealControls();
  }, [revealControls, unlockAudio]);

  const setVolumeLevel = useCallback(
    (level: number) => {
      const v = videoRef.current;
      if (!v) return;
      const next = Math.min(1, Math.max(0, level));
      v.volume = next;
      v.muted = next === 0;
      setVolume(next);
      setMuted(next === 0);
      if (next > 0) volumeBeforeMute.current = next;
      revealControls();
    },
    [revealControls],
  );

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.();
    revealControls();
  }, [revealControls]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isLive) {
      setLiveBehind(0);
      liveDriftRef.current = { pausedAtWall: null, behindAtPause: 0, lastEdge: 0 };
      return;
    }
    measureLiveBehind();
    const id = window.setInterval(() => {
      measureLiveBehind();
    }, 250);
    return () => window.clearInterval(id);
  }, [isLive, measureLiveBehind]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Backspace" || e.key === "Escape" || e.key === "BrowserBack") {
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          revealControls();
          return;
        }
        navigate(-1);
        return;
      }

      revealControls();

      if (e.key === " " || e.key === "MediaPlayPause" || e.key === "k") {
        if (!v) return;
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight" || e.key === "MediaFastForward") {
        e.preventDefault();
        skip(SKIP_S);
      }
      if (e.key === "ArrowLeft" || e.key === "MediaRewind") {
        e.preventDefault();
        skip(-SKIP_S);
      }
      if (isLive && (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ChannelUp")) {
        e.preventDefault();
        void zapChannel(1);
        return;
      }
      if (isLive && (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "ChannelDown")) {
        e.preventDefault();
        void zapChannel(-1);
        return;
      }
      if ((e.key === "+" || e.key === "=") && v) {
        e.preventDefault();
        setVolumeLevel(Math.min(1, (v.muted ? 0 : v.volume) + 0.05));
      }
      if ((e.key === "-" || e.key === "_") && v) {
        e.preventDefault();
        setVolumeLevel(Math.max(0, (v.muted ? 0 : v.volume) - 0.05));
      }
      if (!isLive && e.key === "ArrowUp" && v) {
        e.preventDefault();
        setVolumeLevel(Math.min(1, (v.muted ? 0 : v.volume) + 0.05));
      }
      if (!isLive && e.key === "ArrowDown" && v) {
        e.preventDefault();
        setVolumeLevel(Math.max(0, (v.muted ? 0 : v.volume) - 0.05));
      }
      if (e.key === "a" && (source?.audioTracks?.length ?? 0) > 1) {
        e.preventDefault();
        const tracks = source?.audioTracks ?? [];
        const cur = audioIndex ?? tracks[0]?.index;
        const idx = tracks.findIndex((t) => t.index === cur);
        const next = tracks[(idx + 1) % tracks.length];
        if (next) selectAudioTrack(next.index);
      }
      if (e.key === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === "m") {
        e.preventDefault();
        toggleMute();
      }
      if (e.key === "c" && !isLive) {
        e.preventDefault();
        const tracks = textSubtitles(source);
        if (!tracks.length) return;
        setSubIndex((current) => {
          let next: number | null;
          if (current == null) next = 0;
          else if (current >= tracks.length - 1) next = null;
          else next = current + 1;
          if (next == null) saveSubtitleOff();
          else {
            const track = tracks[next];
            if (track) saveSubtitleTrack(track);
          }
          return next;
        });
        setSubsOpen(false);
      }
      if (e.key === "Home" && v && !isLive) {
        e.preventDefault();
        onSeek(0);
      }
      if (e.key === "End" && v) {
        e.preventDefault();
        if (isLive) goLive();
        else {
          const endAt =
            knownDuration > 0
              ? knownDuration
              : Number.isFinite(v.duration)
                ? v.duration
                : 0;
          if (endAt > 0) onSeek(Math.max(0, endAt - 1));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    navigate,
    onSeek,
    revealControls,
    skip,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    setVolumeLevel,
    isLive,
    goLive,
    source,
    knownDuration,
    zapChannel,
    selectAudioTrack,
    audioIndex,
  ]);

  useEffect(() => {
    if (isLive) {
      setSubIndex(null);
      setCues([]);
      setSubsOpen(false);
      return;
    }
    // Off by default; restore last language (or Off) when that track exists.
    setSubIndex(resolveSubtitleIndex(textSubtitles(source)));
    setCues([]);
    setSubsOpen(false);
  }, [source, isLive]);

  useEffect(() => {
    if (subIndex == null || isLive) {
      setCues([]);
      return;
    }
    const track = textSubtitles(source)[subIndex];
    if (!track) {
      setCues([]);
      return;
    }
    const ac = new AbortController();
    void fetch(track.url, { credentials: "include", signal: ac.signal })
      .then(async (res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!ac.signal.aborted) setCues(parseSubtitleCues(text));
      })
      .catch(() => {
        if (!ac.signal.aborted) setCues([]);
      });
    return () => ac.abort();
  }, [source, subIndex, isLive]);

  useEffect(() => {
    if (!subsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!subsMenuRef.current?.contains(event.target as Node)) setSubsOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [subsOpen]);

  useEffect(() => {
    remuxBaseRef.current = 0;
    sourceGenRef.current += 1;
    if (remuxSeekTimer.current != null) {
      window.clearTimeout(remuxSeekTimer.current);
      remuxSeekTimer.current = null;
    }
    if (knownDuration > 0) setDuration(knownDuration);
    if (source?.startPositionSeconds && source.startPositionSeconds > 30) {
      setCurrent(source.startPositionSeconds);
    }
  }, [source?.delivery.url, knownDuration, source?.startPositionSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    const gen = ++sourceGenRef.current;

    let url = source.delivery.url;
    // Resume remux VOD at the saved absolute offset via server-side `-ss`.
    if (
      remuxVod &&
      source.startPositionSeconds &&
      source.startPositionSeconds > 30
    ) {
      try {
        const abs = new URL(url, window.location.origin);
        abs.searchParams.set("start", String(Math.floor(source.startPositionSeconds)));
        url =
          abs.origin === window.location.origin
            ? `${abs.pathname}${abs.search}`
            : abs.href;
        remuxBaseRef.current = Math.floor(source.startPositionSeconds);
      } catch {
        /* keep original url */
      }
    }

    const useHls =
      source.hls ||
      source.playMethod === "Transcode" ||
      url.includes("m3u8") ||
      source.mimeType?.includes("mpegurl");
    const useMpegTs =
      source.mimeType?.includes("mp2t") ||
      url.includes("/playback/dispatcharr/live/");

    hlsRef.current?.destroy();
    hlsRef.current = null;
    mpegtsRef.current?.destroy();
    mpegtsRef.current = null;
    video.removeAttribute("src");
    video.load();

    if (useMpegTs && mpegts.isSupported()) {
      // Workers cannot fetch relative URLs — always absolute, same-origin
      // (pathname via Vite proxy / Streamerr host so cookies still apply).
      const liveUrl = (() => {
        try {
          const abs = new URL(url, window.location.origin);
          // Never hit API :8787 cross-origin from the web origin.
          if (abs.origin !== window.location.origin) {
            return `${window.location.origin}${abs.pathname}${abs.search}`;
          }
          return abs.href;
        } catch {
          return new URL(url, window.location.origin).href;
        }
      })();

      const player = mpegts.createPlayer(
        {
          type: "mse",
          isLive: true,
          url: liveUrl,
          withCredentials: true,
          hasAudio: true,
          hasVideo: true,
        },
        {
          // Keep transmux on main thread: worker fetch + cookie edge cases are flaky for live.
          enableWorker: false,
          enableStashBuffer: true,
          // mpegts.js expects bytes (not KB). 512 was effectively empty; 512KB absorbs IPTV jitter.
          stashInitialSize: 512 * 1024,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 30,
          autoCleanupMinBackwardDuration: 15,
          liveBufferLatencyChasing: false,
          liveSync: true,
          liveSyncMaxLatency: 4.5,
          liveSyncTargetLatency: 2.5,
          liveSyncPlaybackRate: 1.08,
          fixAudioTimestampGap: true,
        },
      );
      mpegtsRef.current = player;
      let liveRetries = 0;

      const startLivePlayback = () => {
        video.volume = volumeBeforeMute.current || 1;
        setVolume(video.volume);
        // Live starts from an explicit Play click — keep audio on. Do not fall back
        // to muted autoplay (that made Live TV feel permanently muted).
        video.muted = false;
        setMuted(false);
        setNeedsUnmute(false);
        void Promise.resolve(player.play()).catch(() => revealControls(true));
      };

      player.on(mpegts.Events.ERROR, (_type, _detail, info) => {
        console.warn("[live] mpegts error", info);
        if (liveRetries >= 2) {
          revealControls(true);
          return;
        }
        liveRetries += 1;
        window.setTimeout(() => {
          try {
            player.unload();
            player.load();
            startLivePlayback();
          } catch {
            revealControls(true);
          }
        }, 400);
      });
      player.attachMediaElement(video);
      player.load();
      startLivePlayback();
    } else if (useHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (source.startPositionSeconds) {
          video.currentTime = source.startPositionSeconds;
        }
        void video.play().catch(() => revealControls(true));
      });
    } else if (useHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      const onMeta = () => {
        if (sourceGenRef.current !== gen) return;
        if (source.startPositionSeconds) {
          try {
            video.currentTime = source.startPositionSeconds;
          } catch {
            /* ignore */
          }
        }
        void video.play().catch(() => revealControls(true));
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    } else {
      // Progressive VOD — do not force-mute on autoplay failure (that regressed film audio).
      video.src = url;
      void video.play().catch(() => revealControls(true));
    }

    revealControls();

    return () => {
      sourceGenRef.current += 1;
      if (remuxSeekTimer.current != null) {
        window.clearTimeout(remuxSeekTimer.current);
        remuxSeekTimer.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
      mpegtsRef.current?.destroy();
      mpegtsRef.current = null;
    };
  }, [source, revealControls, remuxVod]);

  useEffect(() => {
    if (!source) return;
    const identity = state?.identity;
    const isIptv =
      (source.provider === "dispatcharr" || source.provider === "cache") &&
      Boolean(identity?.tmdbId) &&
      !isLive;

    if (source.itemId) {
      void reportProgress({
        itemId: source.itemId,
        positionSeconds: source.startPositionSeconds ?? 0,
        event: "start",
        playSessionId: source.playSessionId,
        mediaSourceId: source.mediaSourceId,
      });
    } else if (isIptv && identity) {
      // Do not report 0 — that wiped Continue Watching before the first progress tick.
      void reportIptvProgress({
        identity,
        positionSeconds: source.startPositionSeconds ?? 0,
        durationSeconds: knownDuration > 0 ? knownDuration : undefined,
        event: "start",
        title: state?.title,
      });
    }

    const interval = window.setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (source.itemId) {
        void reportProgress({
          itemId: source.itemId,
          positionSeconds: v.currentTime,
          event: "progress",
          playSessionId: source.playSessionId,
          mediaSourceId: source.mediaSourceId,
          isPaused: v.paused,
        });
      } else if (isIptv && identity) {
        void reportIptvProgress({
          identity,
          positionSeconds: remuxBaseRef.current + v.currentTime,
          durationSeconds:
            knownDuration > 0
              ? knownDuration
              : Number.isFinite(v.duration)
                ? v.duration
                : undefined,
          event: "progress",
          title: state?.title,
        });
      }
    }, 10_000);

    return () => {
      window.clearInterval(interval);
      const v = videoRef.current;
      if (!v) return;
      if (source.itemId) {
        void reportProgress({
          itemId: source.itemId,
          positionSeconds: v.currentTime,
          event: "stopped",
          playSessionId: source.playSessionId,
          mediaSourceId: source.mediaSourceId,
        });
      } else if (isIptv && identity) {
        void reportIptvProgress({
          identity,
          positionSeconds: remuxBaseRef.current + v.currentTime,
          durationSeconds:
            knownDuration > 0
              ? knownDuration
              : Number.isFinite(v.duration)
                ? v.duration
                : undefined,
          event: "stopped",
          title: state?.title,
        });
      }
    };
  }, [source, state?.identity, state?.title, isLive, knownDuration]);

  if (!source) {
    return (
      <div className="login-page">
        <p className="error">No playback source. Go back and press Play.</p>
        <Button id="player-back" onClick={() => navigate("/")}>
          Home
        </Button>
      </div>
    );
  }

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const subtitleTracks = textSubtitles(source);
  const audioTracks = source.audioTracks ?? [];
  const activeSubtitleLines = cues
    .filter((cue) => current >= cue.start && current < cue.end)
    .map((cue) => cue.text);
  const remaining = Math.max(0, duration - current);
  const effectiveVolume = muted ? 0 : volume;
  const liveChannelLabel =
    state?.liveChannels?.find((c) => c.uuid === state.channelUuid)?.name ?? state?.title;

  return (
    <div
      ref={rootRef}
      className={`player-page${controlsVisible ? " controls-visible" : " controls-hidden"}`}
      onMouseMove={() => revealControls()}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v && !v.paused && !seeking) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onClick={(e) => {
          e.stopPropagation();
          if (needsUnmute || e.currentTarget.muted || e.currentTarget.volume === 0) {
            unlockAudio();
            return;
          }
          togglePlay();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          toggleFullscreen();
        }}
        onPlay={() => {
          setPaused(false);
          liveDriftRef.current.pausedAtWall = null;
          revealControls();
        }}
        onPause={() => {
          setPaused(true);
          const behind = measureLiveBehind();
          liveDriftRef.current.pausedAtWall = Date.now();
          liveDriftRef.current.behindAtPause = behind;
          revealControls(true);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!seeking) setCurrent(remuxBaseRef.current + v.currentTime);
          if (v.buffered.length > 0) {
            try {
              setBuffered(remuxBaseRef.current + v.buffered.end(v.buffered.length - 1));
            } catch {
              /* ignore */
            }
          }
          if (isLive) measureLiveBehind();
        }}
        onLoadedMetadata={(e) => {
          setDuration(
            finiteDuration(e.currentTarget.duration, knownDuration, remuxVod),
          );
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
          if (
            source.startPositionSeconds &&
            remuxBaseRef.current === 0 &&
            !isRemuxVodUrl(source.delivery.url)
          ) {
            e.currentTarget.currentTime = source.startPositionSeconds;
          }
        }}
        onDurationChange={(e) =>
          setDuration(
            finiteDuration(e.currentTarget.duration, knownDuration, remuxVod),
          )
        }
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
      />

      {activeSubtitleLines.length ? (
        <div className="player-subs" aria-live="off">
          {activeSubtitleLines.map((line, index) => (
            <p key={`${index}-${line}`} className="player-subs-line">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {needsUnmute ? (
        <button
          type="button"
          className="player-unmute-cta"
          onClick={unlockAudio}
          aria-label="Unmute"
        >
          <IconVolume muted level={0} />
          <span>Click to unmute</span>
        </button>
      ) : paused && controlsVisible ? (
        <button
          type="button"
          className="player-center-play"
          onClick={togglePlay}
          aria-label="Play"
        >
          <IconPlay />
        </button>
      ) : null}

      <div
        className="player-chrome"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={() => revealControls()}
      >
        <div className="player-top">
          <button
            type="button"
            className="player-icon-btn player-back"
            id="player-exit"
            onClick={() => navigate(-1)}
            aria-label="Back"
            autoFocus
          >
            <IconBack />
          </button>
          <div className="player-title">
            {isLive ? <LiveBadge behind={liveBehind} onGoLive={goLive} /> : null}
            {!isLive && source.provider === "cache" && !downloadComplete ? (
              <span className="player-download-chip" aria-live="polite">
                Downloading
                {downloadTotal && downloadTotal > 0
                  ? ` · ${Math.min(99, Math.round((downloadBytes / downloadTotal) * 100))}%`
                  : downloadBytes > 0
                    ? ` · ${Math.round(downloadBytes / 1_000_000)} MB`
                    : "…"}
              </span>
            ) : null}
            <span className="player-title-text">
              {liveChannelLabel ?? state?.title ?? "Now playing"}
              {zapping ? " · Changing…" : null}
            </span>
          </div>
          {isLive && (state?.liveChannels?.length ?? 0) > 1 ? (
            <div className="player-zap">
              <button
                type="button"
                className="player-icon-btn"
                aria-label="Previous channel"
                disabled={zapping}
                onClick={() => void zapChannel(-1)}
              >
                CH−
              </button>
              <button
                type="button"
                className="player-icon-btn"
                aria-label="Next channel"
                disabled={zapping}
                onClick={() => void zapChannel(1)}
              >
                CH+
              </button>
            </div>
          ) : null}
        </div>

        <div className="player-bottom">
          {!isLive ? (
            <div
              className="player-scrub-wrap"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                setScrubHover(ratio * (duration || 0));
              }}
              onMouseLeave={() => setScrubHover(null)}
            >
              {scrubHover !== null && duration > 0 ? (
                <div
                  className="player-scrub-tip"
                  style={{ left: `${(scrubHover / duration) * 100}%` }}
                >
                  {formatTime(scrubHover)}
                </div>
              ) : null}
              <div className="player-scrub-track">
                <div className="player-scrub-buffer" style={{ width: `${bufferPct}%` }} />
                <div className="player-scrub-played" style={{ width: `${progressPct}%` }} />
                <input
                  className="player-scrub"
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(current, duration || 0)}
                  onPointerDown={() => setSeeking(true)}
                  onPointerUp={(e) => {
                    setSeeking(false);
                    onSeek(Number((e.target as HTMLInputElement).value));
                  }}
                  onKeyUp={(e) => {
                    if (
                      e.key === "ArrowLeft" ||
                      e.key === "ArrowRight" ||
                      e.key === "Home" ||
                      e.key === "End"
                    ) {
                      onSeek(Number((e.target as HTMLInputElement).value));
                    }
                  }}
                  onChange={(e) => {
                    // Preview only while dragging — remux restart commits on pointer up.
                    setCurrent(Number(e.target.value));
                  }}
                  aria-label="Seek"
                />
              </div>
            </div>
          ) : (
            <div
              className={`player-live-bar${liveBehind >= LIVE_BEHIND_THRESHOLD ? " is-behind" : ""}`}
              aria-hidden="true"
            />
          )}

          <div className="player-controls-row">
            <div className="player-controls-left">
              {!isLive ? (
                <button
                  type="button"
                  className="player-icon-btn"
                  onClick={() => skip(-SKIP_S)}
                  aria-label="Rewind 10 seconds"
                >
                  <IconSkip dir="back" />
                </button>
              ) : null}
              <button
                type="button"
                className="player-icon-btn player-play-btn"
                onClick={togglePlay}
                aria-label={paused ? "Play" : "Pause"}
              >
                {paused ? <IconPlay /> : <IconPause />}
              </button>
              {!isLive ? (
                <button
                  type="button"
                  className="player-icon-btn"
                  onClick={() => skip(SKIP_S)}
                  aria-label="Forward 10 seconds"
                >
                  <IconSkip dir="forward" />
                </button>
              ) : liveBehind >= LIVE_BEHIND_THRESHOLD ? (
                <button
                  type="button"
                  className="player-icon-btn"
                  onClick={() => skip(SKIP_S)}
                  aria-label="Forward 10 seconds toward live"
                >
                  <IconSkip dir="forward" />
                </button>
              ) : null}

              <div
                className={`player-volume${volumeOpen ? " is-open" : ""}`}
                onMouseEnter={() => setVolumeOpen(true)}
                onMouseLeave={() => setVolumeOpen(false)}
              >
                <button
                  type="button"
                  className="player-icon-btn"
                  onClick={toggleMute}
                  aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                >
                  <IconVolume muted={muted} level={effectiveVolume} />
                </button>
                <input
                  className="player-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={effectiveVolume}
                  onChange={(e) => setVolumeLevel(Number(e.target.value))}
                  aria-label="Volume"
                />
              </div>

              <span className="player-time">
                {isLive ? (
                  <LiveBadge
                    className="player-live-badge-inline"
                    behind={liveBehind}
                    onGoLive={goLive}
                  />
                ) : (
                  <>
                    <span className="player-time-current">{formatTime(current)}</span>
                    <span className="player-time-sep"> / </span>
                    <span className="player-time-total">{formatTime(duration)}</span>
                    {duration > 0 ? (
                      <span className="player-time-remaining"> · {formatTime(remaining)} left</span>
                    ) : null}
                  </>
                )}
              </span>
            </div>

            <div className="player-controls-right">
              {audioTracks.length > 1 && !isLive ? (
                <div className="player-menu" ref={audioMenuRef}>
                  <button
                    type="button"
                    className={`player-icon-btn${audioOpen ? " is-on" : ""}`}
                    onClick={() => {
                      setAudioOpen((open) => !open);
                      setSubsOpen(false);
                      revealControls(true);
                    }}
                    aria-label="Audio track"
                    aria-expanded={audioOpen}
                    aria-haspopup="menu"
                  >
                    <IconAudio />
                  </button>
                  {audioOpen ? (
                    <div className="player-menu-panel" role="menu" aria-label="Audio">
                      <div className="player-menu-heading">Audio</div>
                      {audioTracks.map((track) => (
                        <button
                          key={track.index}
                          type="button"
                          role="menuitemradio"
                          aria-checked={audioIndex === track.index}
                          className={`player-menu-item${audioIndex === track.index ? " is-active" : ""}`}
                          onClick={() => selectAudioTrack(track.index)}
                        >
                          {track.label || track.language || `Track ${track.index}`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {subtitleTracks.length && !isLive ? (
                <div className="player-menu" ref={subsMenuRef}>
                  <button
                    type="button"
                    className={`player-icon-btn${subIndex != null ? " is-on" : ""}`}
                    onClick={() => {
                      setSubsOpen((open) => !open);
                      setAudioOpen(false);
                      revealControls(true);
                    }}
                    aria-label="Subtitles"
                    aria-expanded={subsOpen}
                    aria-haspopup="menu"
                  >
                    <IconCc />
                  </button>
                  {subsOpen ? (
                    <div className="player-menu-panel" role="menu" aria-label="Subtitles">
                      <div className="player-menu-heading">Subtitles</div>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={subIndex == null}
                        className={`player-menu-item${subIndex == null ? " is-active" : ""}`}
                        onClick={() => {
                          setSubIndex(null);
                          saveSubtitleOff();
                          setSubsOpen(false);
                          revealControls();
                        }}
                      >
                        Off
                      </button>
                      {subtitleTracks.map((track, index) => (
                        <button
                          key={`${track.url}-${index}`}
                          type="button"
                          role="menuitemradio"
                          aria-checked={subIndex === index}
                          className={`player-menu-item${subIndex === index ? " is-active" : ""}`}
                          onClick={() => {
                            setSubIndex(index);
                            saveSubtitleTrack(track);
                            setSubsOpen(false);
                            revealControls();
                          }}
                        >
                          {track.label || track.language || `Subtitle ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="player-icon-btn"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                <IconFullscreen active={fullscreen} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
