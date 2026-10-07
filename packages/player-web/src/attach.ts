import Hls from "hls.js";
import mpegts from "mpegts.js";
import type { PlaybackSource } from "@streamerr/shared";
import {
  classifyPlayback,
  type PlaybackSurfaceAttachOpts,
  type PlaybackSurfaceHandle,
} from "@streamerr/client";

/**
 * Attach hls.js / mpegts.js / native src to an HTMLVideoElement.
 * Implements the PlaybackSurface contract for browser / RN-web.
 */
export function attachWebPlayback(
  video: HTMLVideoElement,
  opts: PlaybackSurfaceAttachOpts,
): PlaybackSurfaceHandle {
  const { source, onProgress, onEnd, onError, onLoad, startPosition } = opts;
  let destroyed = false;
  let hls: Hls | null = null;
  let mpeg: mpegts.Player | null = null;

  const kind = classifyPlayback(source);
  const url = source.delivery.url;

  const tick = () => {
    if (destroyed) return;
    onProgress({
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  };

  const onTimeUpdate = () => tick();
  const onLoaded = () => {
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    onLoad?.({ duration: d });
    if (startPosition && startPosition > 30 && Number.isFinite(startPosition)) {
      try {
        video.currentTime = startPosition;
      } catch {
        /* ignore */
      }
    }
    if (!opts.paused) void video.play().catch(() => undefined);
  };
  const onEnded = () => onEnd();
  const onVidError = () => onError(video.error?.message ?? "Playback failed");

  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("loadedmetadata", onLoaded);
  video.addEventListener("ended", onEnded);
  video.addEventListener("error", onVidError);

  if (kind === "mpegts" && mpegts.getFeatureList().mseLivePlayback) {
    mpeg = mpegts.createPlayer(
      { type: "mse", isLive: true, url },
      { enableWorker: true, liveBufferLatencyChasing: true, stashInitialSize: 384 * 1024 },
    );
    mpeg.attachMediaElement(video);
    mpeg.load();
    mpeg.on(mpegts.Events.ERROR, (_t: string, _d: unknown, info: { msg?: string }) => {
      onError(info?.msg ?? "Live stream error");
    });
  } else if (kind === "hls" && Hls.isSupported()) {
    const resumeAt = startPosition && startPosition > 30 ? startPosition : -1;
    hls = new Hls({
      enableWorker: true,
      startPosition: resumeAt,
      // Jellyfin remux/transcode segments can be slow on first hit after seek/reload.
      fragLoadingTimeOut: 30_000,
      fragLoadingMaxRetry: 4,
      fragLoadingRetryDelay: 1_000,
      manifestLoadingTimeOut: 20_000,
      levelLoadingTimeOut: 20_000,
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    // Reinforce resume after the manifest is ready — startPosition alone can
    // lose a race on some remux/transcode playlists.
    if (resumeAt > 30) {
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        try {
          if (Math.abs(video.currentTime - resumeAt) > 2) {
            video.currentTime = resumeAt;
          }
        } catch {
          /* ignore */
        }
      });
    }
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      // Auto-recover transient network / media errors before surfacing UI.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls?.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls?.recoverMediaError();
        return;
      }
      onError(data.details || "HLS error");
    });
  } else {
    video.src = url;
  }

  return {
    play: () => {
      void video.play().catch(() => undefined);
    },
    pause: () => {
      video.pause();
    },
    seek: (seconds: number) => {
      const target = Math.max(0, seconds);
      try {
        // Prefer seeking inside the current seekable window when present.
        if (video.seekable.length > 0) {
          const start = video.seekable.start(0);
          const end = video.seekable.end(video.seekable.length - 1);
          if (target >= start && target <= end) {
            video.currentTime = target;
            return;
          }
        }
        video.currentTime = target;
      } catch {
        /* ignore */
      }
    },
    destroy: () => {
      destroyed = true;
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onVidError);
      hls?.destroy();
      hls = null;
      if (mpeg) {
        mpeg.destroy();
        mpeg = null;
      }
      video.removeAttribute("src");
      video.load();
    },
    getPosition: () => video.currentTime,
    getDuration: () => (Number.isFinite(video.duration) ? video.duration : 0),
  };
}

export function absolutePlaybackUrl(source: PlaybackSource, origin: string): string {
  const url = source.delivery.url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(url.replace(/^\//, ""), base).href;
}
