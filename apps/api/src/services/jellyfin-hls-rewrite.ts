/**
 * Rewrite Jellyfin HLS playlists so every URI goes through Streamerr's
 * `/api/playback/jellyfin/hls` proxy (tokens stay server-side).
 * Tag lines without URI= (including `#EXT-X-ENDLIST`) are left unchanged.
 */
export function rewriteHlsPlaylist(
  playlist: string,
  context: {
    transcodingPath?: string;
    path?: string;
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
            return `URI="${toHlsProxyUrl(resolveJellyfinUri(uri, baseDir))}"`;
          });
        }
        return line;
      }
      return toHlsProxyUrl(resolveJellyfinUri(trimmed, baseDir));
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

export function toHlsProxyUrl(jellyfinPath: string): string {
  return `/api/playback/jellyfin/hls?path=${encodeURIComponent(jellyfinPath)}`;
}
