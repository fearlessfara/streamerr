import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@streamerr/ui";
import {
  cancelAcquisition,
  formatCacheTtlRemaining,
  listAcquisitions,
  promoteAcquisition,
} from "../lib/api";
import { AppChrome } from "../components/AppChrome";

function formatMb(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return "0";
  return String(Math.round(bytes / 1_000_000));
}

function mediaHref(identity: {
  mediaType: string;
  tmdbId?: number;
  jellyfinItemId?: string;
}): string | null {
  if (identity.jellyfinItemId) return `/media/jellyfin/${identity.jellyfinItemId}`;
  if (identity.tmdbId && (identity.mediaType === "movie" || identity.mediaType === "tv")) {
    return `/media/${identity.mediaType}/${identity.tmdbId}`;
  }
  if (identity.tmdbId && identity.mediaType === "episode") {
    return `/media/tv/${identity.tmdbId}`;
  }
  return null;
}

export function DownloadsPage({ username }: { username: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["acquisitions"],
    queryFn: listAcquisitions,
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const active = items.some((i) =>
        ["queued", "downloading", "playable"].includes(i.state),
      );
      return active ? 2000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAcquisition(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["acquisitions"] }),
  });

  const promote = useMutation({
    mutationFn: (id: string) => promoteAcquisition(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["acquisitions"] }),
  });

  const items = query.data?.items ?? [];

  return (
    <AppChrome username={username} solid>
      <main className="app-main catalog-page">
        <div className="catalog-header">
          <h1>Downloads</h1>
          <p>IPTV cache and library acquisitions. Promote finished caches into Jellyfin.</p>
        </div>

        {query.isLoading ? <div className="page-status">Loading…</div> : null}
        {query.isError ? (
          <div className="page-status error">{(query.error as Error).message}</div>
        ) : null}

        {!query.isLoading && items.length === 0 ? (
          <div className="page-status">No downloads yet. Play an IPTV title to start caching.</div>
        ) : null}

        <ul className="downloads-list">
          {items.map((item) => {
            const href = mediaHref(item.identity);
            const pct =
              item.totalBytes && item.totalBytes > 0
                ? Math.min(100, Math.round((item.bytesDownloaded / item.totalBytes) * 100))
                : null;
            const ttl = formatCacheTtlRemaining(item.cacheExpiresAt);
            const label = [
              item.identity.mediaType,
              item.identity.tmdbId != null ? `TMDb ${item.identity.tmdbId}` : null,
              item.identity.mediaType === "episode" &&
              item.identity.seasonNumber != null &&
              item.identity.episodeNumber != null
                ? `S${item.identity.seasonNumber}E${item.identity.episodeNumber}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={item.id} className="downloads-row">
                <div className="downloads-meta">
                  <div className="downloads-title">
                    {href ? <Link to={href}>{label}</Link> : label}
                  </div>
                  <div className="downloads-sub">
                    <span className={`downloads-state is-${item.state}`}>{item.state}</span>
                    <span>
                      {formatMb(item.bytesDownloaded)}
                      {item.totalBytes ? ` / ${formatMb(item.totalBytes)}` : ""} MB
                      {pct != null ? ` · ${pct}%` : ""}
                    </span>
                    <span>{item.mode === "library" ? "Library" : "Cache"}</span>
                    {ttl && item.mode === "cache" ? <span>Cached · {ttl}</span> : null}
                  </div>
                  {pct != null ? (
                    <div className="downloads-bar" aria-hidden="true">
                      <div className="downloads-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="downloads-actions">
                  {["queued", "downloading", "playable"].includes(item.state) ? (
                    <Button
                      id={`dl-cancel-${item.id}`}
                      variant="ghost"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(item.id)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {item.mode === "cache" &&
                  (item.state === "completed" || item.state === "playable") &&
                  item.playbackAvailable ? (
                    <Button
                      id={`dl-promote-${item.id}`}
                      disabled={promote.isPending}
                      onClick={() => promote.mutate(item.id)}
                    >
                      Add to Library
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </AppChrome>
  );
}
