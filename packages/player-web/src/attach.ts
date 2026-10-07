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
    hls = new Hls({ enableWorker: true, startPosition: startPosition && startPosition > 30 ? startPosition : -1 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) onError(data.details || "HLS error");
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
      try {
        video.currentTime = seconds;
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
