import type { MediaIdentity, PlaybackSource, SubtitleTrack } from "@streamerr/shared";
import { SESSION_COOKIE, SESSION_HEADER } from "./session.js";
import { maxSeekableSecondsForSource } from "./seek-cap.js";

export type PlaybackKind = "hls" | "mpegts" | "progressive";

export function classifyPlayback(source: PlaybackSource): PlaybackKind {
  const url = source.delivery.url;
  const mime = source.mimeType ?? "";
  if (mime.includes("mp2t") || url.includes("/playback/dispatcharr/live/")) {
    return "mpegts";
  }
  if (
    Boolean(source.hls) ||
    source.playMethod === "Transcode" ||
    url.includes("m3u8") ||
    mime.includes("mpegurl")
  ) {
    return "hls";
  }
  return "progressive";
}

export function absoluteUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin || "http://localhost").href;
  } catch {
    return url;
  }
}

export function sessionCookieHeader(sessionId: string | null | undefined): Record<string, string> {
  if (!sessionId) return {};
  return {
    Cookie: `${SESSION_COOKIE}=${sessionId}`,
    [SESSION_HEADER]: sessionId,
  };
}

export function isIptvProgressSource(
  provider: PlaybackSource["provider"] | undefined,
  live: boolean,
  identity?: MediaIdentity,
): boolean {
  return (provider === "dispatcharr" || provider === "cache") && Boolean(identity?.tmdbId) && !live;
}

export function seekCapForSource(source: PlaybackSource, knownDuration: number): number {
  return maxSeekableSecondsForSource({
    provider: source.provider,
    downloadComplete: Boolean(source.downloadComplete),
    downloadBytes: source.bytesDownloaded ?? 0,
    downloadTotal: source.totalBytes,
    knownDuration,
  });
}

export function textSubtitles(
  tracks: SubtitleTrack[] | undefined,
): Array<SubtitleTrack & { url: string }> {
  return (tracks ?? []).filter(
    (track): track is SubtitleTrack & { url: string } => Boolean(track.url),
  );
}

export function withCatalogueDuration(
  source: PlaybackSource,
  meta?: { durationSeconds?: number; runtimeMinutes?: number } | null,
): PlaybackSource {
  if (source.durationSeconds != null && source.durationSeconds > 0) return source;
  const fromMeta =
    meta?.durationSeconds != null && meta.durationSeconds > 0
      ? meta.durationSeconds
      : meta?.runtimeMinutes != null && meta.runtimeMinutes > 0
        ? meta.runtimeMinutes * 60
        : undefined;
  if (fromMeta == null) return source;
  return { ...source, durationSeconds: fromMeta };
}

export function formatCacheTtlRemaining(cacheExpiresAt?: string | null): string | null {
  if (!cacheExpiresAt) return null;
  const ms = Date.parse(cacheExpiresAt) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "expires soon";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days} days left`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours >= 2) return `${hours} hours left`;
  return "under an hour left";
}

export function resumeSecondsFromSource(source: PlaybackSource): number {
  const start = source.startPositionSeconds;
  if (start != null && start > 30) return start;
  return 0;
}
