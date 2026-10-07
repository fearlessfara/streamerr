import { SESSION_COOKIE } from "./session.js";

/**
 * Rewrite Jellyfin HLS playlists so every URI goes through Streamerr's
 * `/api/playback/jellyfin/hls` proxy (tokens stay server-side).
 * Tag lines without URI= (including `#EXT-X-ENDLIST`) are left unchanged.
 *
 * Optional sessionId is embedded in each proxy URL so React Native / AVPlayer
 * can auth segment requests (custom headers are not reliable on HLS).
 */
export function rewriteHlsPlaylist(
  playlist: string,
  context: {
    transcodingPath?: string;
    path?: string;
    sessionId?: string;
    /** e.g. http://192.168.1.220:8787 — absolute segment URLs help AVPlayer. */
    publicOrigin?: string;
  },
): string {
  const baseDir = (() => {
    const raw = context.transcodingPath ?? context.path ?? "";
    const withoutQuery = raw.split("?")[0] ?? "";
    const idx = withoutQuery.lastIndexOf("/");
    return idx >= 0 ? withoutQuery.slice(0, idx + 1) : "/";
  })();

  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return trimmed.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            return `URI="${toHlsProxyUrl(resolveJellyfinUri(uri, baseDir), context.sessionId, context.publicOrigin)}"`;
          });
        }
        return line;
      }
      return toHlsProxyUrl(
        resolveJellyfinUri(trimmed, baseDir),
        context.sessionId,
        context.publicOrigin,
      );
    })
    .join("\n");
}

export function resolveJellyfinUri(uri: string, baseDir: string): string {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      const u = new URL(uri);
      return `${u.pathname}${u.search}`;
    } catch {
      return uri;
    }
  }
  if (uri.startsWith("/")) return uri;
  return `${baseDir}${uri}`;
}

export function toHlsProxyUrl(
  jellyfinPath: string,
  sessionId?: string,
  publicOrigin?: string,
): string {
  let url = `/api/playback/jellyfin/hls?path=${encodeURIComponent(jellyfinPath)}`;
  if (sessionId) {
    url += `&${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`;
  }
  if (publicOrigin) {
    return `${publicOrigin.replace(/\/$/, "")}${url}`;
  }
  return url;
}

/** Origin the client used to reach us (LAN IP on phone, not localhost). */
export function requestPublicOrigin(req: {
  protocol?: string;
  headers: Record<string, unknown>;
}): string | undefined {
  const host = req.headers.host;
  if (typeof host !== "string" || !host.trim()) return undefined;
  const xf = req.headers["x-forwarded-proto"];
  const proto =
    typeof xf === "string" && xf.trim()
      ? xf.split(",")[0]!.trim()
      : req.protocol === "https"
        ? "https"
        : "http";
  return `${proto}://${host.trim()}`;
}

/** Embed session on relative/absolute segment lines in a cache (on-disk) playlist. */
export function embedSessionInPlaylist(playlist: string, sessionId: string): string {
  if (!sessionId) return playlist;
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.includes("URI=")) {
          return trimmed.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            return `URI="${withSessionQuery(uri, sessionId)}"`;
          });
        }
        return line;
      }
      return withSessionQuery(trimmed, sessionId);
    })
    .join("\n");
}

function withSessionQuery(uri: string, sessionId: string): string {
  if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("/")) {
    try {
      const u = new URL(uri, "http://streamerr.local");
      u.searchParams.set(SESSION_COOKIE, sessionId);
      if (uri.startsWith("http://") || uri.startsWith("https://")) return u.href;
      return `${u.pathname}${u.search}`;
    } catch {
      /* fall through */
    }
  }
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`;
}
