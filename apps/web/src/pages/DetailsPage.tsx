import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EpisodeListItem } from "@streamerr/shared";
import { Button } from "@streamerr/ui";
import {
  cancelAcquisition,
  formatCacheTtlRemaining,
  getAcquisition,
  mediaByJellyfin,
  mediaByTmdb,
  promoteAcquisition,
  requestMedia,
  resolvePlaybackForPlay,
  seriesEpisodes,
} from "../lib/api";
import { actionLabel, formatRuntime } from "../lib/media";
import { AppChrome } from "../components/AppChrome";

function formatMb(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return "0";
  return String(Math.round(bytes / 1_000_000));
}

export function DetailsPage({ username }: { username: string }) {
  const { itemId, type, tmdbId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isJellyfin = Boolean(itemId);
  const tmdbType = type === "movie" || type === "tv" ? type : null;
  const tmdbNum = tmdbId ? Number(tmdbId) : NaN;
  const queryKey = isJellyfin
    ? (["media", "jellyfin", itemId] as const)
    : (["media", tmdbType, tmdbNum] as const);

  const details = useQuery({
    queryKey,
    queryFn: () => {
      if (isJellyfin && itemId) return mediaByJellyfin(itemId);
      if (tmdbType && Number.isFinite(tmdbNum)) return mediaByTmdb(tmdbType, tmdbNum);
      throw new Error("Missing media id");
    },
    enabled: isJellyfin ? Boolean(itemId) : Boolean(tmdbType && Number.isFinite(tmdbNum)),
  });

  const media = details.data?.media;
  const cache = media?.availability.find((a) => a.provider === "cache");
  const isTv =
    media?.identity.mediaType === "tv" || tmdbType === "tv";
  const seriesTmdbId = media?.identity.tmdbId ?? (Number.isFinite(tmdbNum) ? tmdbNum : undefined);

  const episodesQuery = useQuery({
    queryKey: ["media", "tv", seriesTmdbId, "episodes"],
    queryFn: () => seriesEpisodes(seriesTmdbId!),
    enabled: Boolean(isTv && seriesTmdbId),
  });

  const [season, setSeason] = useState<number | null>(null);
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);
  useEffect(() => {
    const seasons = episodesQuery.data?.seasons ?? [];
    if (seasons.length && (season === null || !seasons.includes(season))) {
      setSeason(seasons[0]!);
    }
  }, [episodesQuery.data?.seasons, season]);

  const seasonEpisodes = useMemo(() => {
    const items = episodesQuery.data?.items ?? [];
    if (season === null) return items;
    return items.filter((e) => e.seasonNumber === season);
  }, [episodesQuery.data?.items, season]);

  const playEpisode = useMutation({
    mutationFn: async (ep: EpisodeListItem) => {
      setBufferStatus("Resolving…");
      const source = await resolvePlaybackForPlay(ep.identity, {
        meta: { runtimeMinutes: ep.runtimeMinutes },
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            const pct = Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100));
            setBufferStatus(`Buffering download… ${pct}%`);
          } else {
            setBufferStatus(`Buffering download… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      });
      return { source, title: ep.title };
    },
    onSuccess: ({ source, title }, ep) => {
      setBufferStatus(null);
      navigate("/play", { state: { source, title, identity: ep.identity } });
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["media", "tv", seriesTmdbId, "episodes"] });
    },
    onError: () => setBufferStatus(null),
  });

  const acquisitionId = cache?.acquisitionId;

  const acquisition = useQuery({
    queryKey: ["acquisition", acquisitionId],
    queryFn: () => getAcquisition(acquisitionId!),
    enabled: Boolean(acquisitionId),
    refetchInterval: (q) => {
      const state = q.state.data?.item.state;
      if (state === "downloading" || state === "queued" || state === "playable") return 1500;
      return false;
    },
  });

  useEffect(() => {
    const state = acquisition.data?.item.state;
    if (state === "playable" || state === "completed") {
      void qc.invalidateQueries({ queryKey });
    }
  }, [acquisition.data?.item.state, qc, queryKey]);

  const play = useMutation({
    mutationFn: async () => {
      if (!media) throw new Error("No media");
      setBufferStatus("Resolving…");
      return resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            const pct = Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100));
            setBufferStatus(`Buffering download… ${pct}%`);
          } else {
            setBufferStatus(`Buffering download… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      });
    },
    onSuccess: (source) => {
      setBufferStatus(null);
      navigate("/play", {
        state: { source, title: media?.metadata.title, identity: media?.identity },
      });
      void qc.invalidateQueries({ queryKey });
    },
    onError: () => setBufferStatus(null),
  });

  const request = useMutation({
    mutationFn: async () => {
      if (!media) throw new Error("No media");
      return requestMedia(media.identity);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!acquisitionId) throw new Error("No acquisition");
      return cancelAcquisition(acquisitionId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["acquisition"] });
    },
  });

  const promote = useMutation({
    mutationFn: async () => {
      if (!acquisitionId) throw new Error("No acquisition");
      return promoteAcquisition(acquisitionId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["acquisition"] });
    },
  });

  const bg = media?.metadata.backdropUrl || media?.metadata.posterUrl;
  const chips = media
    ? [
        media.metadata.year ? String(media.metadata.year) : null,
        media.identity.mediaType,
        formatRuntime(media.metadata.runtimeMinutes),
        !media.identity.tmdbId ? "Library only" : null,
      ].filter(Boolean)
    : [];

  const canPlay =
    media?.preferredAction === "PLAY_JELLYFIN" ||
    media?.preferredAction === "PLAY_CACHE" ||
    media?.preferredAction === "PLAY_IPTV";
  const canRequest = media?.preferredAction === "REQUEST";
  const job = acquisition.data?.item;
  const downloading =
    job?.state === "downloading" || job?.state === "queued" || job?.state === "playable";
  const canPromote =
    Boolean(job) &&
    job!.mode === "cache" &&
    (job!.state === "completed" || job!.state === "playable" || downloading);
  const primaryLabel = media ? actionLabel(media) : "▶ Play";
  const pct =
    job?.totalBytes && job.totalBytes > 0
      ? Math.min(100, Math.round((job.bytesDownloaded / job.totalBytes) * 100))
      : null;
  const cacheTtlLabel =
    job?.mode === "cache" && (job.state === "completed" || job.state === "playable")
      ? formatCacheTtlRemaining(job.cacheExpiresAt)
      : null;
  const playBusy = play.isPending || playEpisode.isPending;

  return (
    <AppChrome username={username} solid>
      <div className="details-page">
        {bg ? (
          <div className="details-backdrop" style={{ backgroundImage: `url(${bg})` }} />
        ) : (
          <div className="details-backdrop" />
        )}

        <main className="details-layout">
          <div className="details-body">
            {details.isLoading ? (
              <p className="empty-rail" style={{ padding: 0 }}>
                Loading…
              </p>
            ) : null}
            {details.isError ? <p className="error">{(details.error as Error).message}</p> : null}
            {media ? (
              <>
                <h1 className="details-title">{media.metadata.title}</h1>
                {chips.length ? (
                  <div className="details-meta-row">
                    {chips.map((chip) => (
                      <span key={String(chip)} className="meta-chip">
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="details-overview">
                  {media.metadata.overview || "No overview available."}
                </p>
                <div className="details-actions">
                  {canPlay && !isTv ? (
                    <Button id="play" onClick={() => play.mutate()} autoFocus disabled={playBusy}>
                      {playBusy ? bufferStatus || "Starting…" : primaryLabel}
                    </Button>
                  ) : null}
                  {canPlay && isTv && media.preferredAction === "PLAY_JELLYFIN" ? (
                    <Button id="play" onClick={() => play.mutate()} autoFocus disabled={playBusy}>
                      {playBusy ? bufferStatus || "Starting…" : "▶ Play"}
                    </Button>
                  ) : null}
                  {canPromote ? (
                    <Button
                      id="promote"
                      variant="secondary"
                      onClick={() => promote.mutate()}
                      disabled={promote.isPending}
                    >
                      {promote.isPending ? "Adding…" : "Add to Library"}
                    </Button>
                  ) : null}
                  {canRequest ? (
                    <Button
                      id="request"
                      variant="secondary"
                      onClick={() => request.mutate()}
                      autoFocus={!canPlay}
                    >
                      {request.isPending ? "Requesting…" : primaryLabel}
                    </Button>
                  ) : null}
                  {downloading ? (
                    <button
                      type="button"
                      className="details-icon-btn"
                      title="Cancel download"
                      aria-label="Cancel download"
                      onClick={() => cancel.mutate()}
                    >
                      ✕
                    </button>
                  ) : null}
                  {!canPlay && !canRequest ? (
                    <Button id="status" variant="secondary" onClick={() => undefined}>
                      {primaryLabel}
                    </Button>
                  ) : null}
                </div>

                {job && job.state !== "cancelled" ? (
                  <div className="acquire-progress" aria-live="polite">
                    {job.state !== "completed" || job.mode === "cache" ? (
                      <div className="acquire-progress-bar">
                        <div
                          className="acquire-progress-fill"
                          style={{
                            width: `${
                              job.state === "completed"
                                ? 100
                                : (pct ?? (job.playbackAvailable ? 8 : 2))
                            }%`,
                          }}
                        />
                      </div>
                    ) : null}
                    <p className="details-status">
                      {job.mode === "library" && job.state === "completed"
                        ? "In library."
                        : job.state === "completed" && job.mode === "cache"
                          ? `Cached${cacheTtlLabel ? ` · ${cacheTtlLabel}` : ""}`
                          : `Downloading · ${formatMb(job.bytesDownloaded)} MB${
                              job.totalBytes ? ` / ${formatMb(job.totalBytes)} MB` : ""
                            }${pct !== null ? ` (${pct}%)` : ""}${
                              cacheTtlLabel ? ` · Cached · ${cacheTtlLabel}` : ""
                            }`}
                    </p>
                  </div>
                ) : null}

                {play.isError ? <p className="error">{(play.error as Error).message}</p> : null}
                {request.isError ? (
                  <p className="error">{(request.error as Error).message}</p>
                ) : null}
                {cancel.isError ? (
                  <p className="error">{(cancel.error as Error).message}</p>
                ) : null}
                {promote.isError ? (
                  <p className="error">{(promote.error as Error).message}</p>
                ) : null}
                {request.isSuccess ? (
                  <p className="details-status">Request submitted.</p>
                ) : null}
                {playEpisode.isError ? (
                  <p className="error">{(playEpisode.error as Error).message}</p>
                ) : null}

                {isTv ? (
                  <section className="episode-section">
                    <div className="episode-section-head">
                      <h2>Episodes</h2>
                      {(episodesQuery.data?.seasons.length ?? 0) > 1 ? (
                        <div className="episode-season-tabs">
                          {episodesQuery.data!.seasons.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`episode-season-tab${season === s ? " active" : ""}`}
                              onClick={() => setSeason(s)}
                            >
                              Season {s}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {episodesQuery.isLoading ? (
                      <p className="details-status">Loading episodes…</p>
                    ) : null}
                    {episodesQuery.isError ? (
                      <p className="error">{(episodesQuery.error as Error).message}</p>
                    ) : null}
                    {!episodesQuery.isLoading && seasonEpisodes.length === 0 ? (
                      <p className="details-status">
                        No episodes found for this series yet.
                      </p>
                    ) : null}
                    <ul className="episode-list">
                      {seasonEpisodes.map((ep) => {
                        const playable =
                          ep.preferredAction === "PLAY_IPTV" ||
                          ep.preferredAction === "PLAY_JELLYFIN" ||
                          ep.preferredAction === "PLAY_CACHE";
                        return (
                          <li key={`${ep.seasonNumber}-${ep.episodeNumber}-${ep.identity.tmdbId}`}>
                            <div className="episode-row-wrap">
                              <button
                                type="button"
                                className="episode-row"
                                disabled={!playable || playBusy}
                                onClick={() => playEpisode.mutate(ep)}
                              >
                                <span className="episode-num">
                                  E{String(ep.episodeNumber).padStart(2, "0")}
                                </span>
                                <span className="episode-meta">
                                  <span className="episode-title">{ep.title}</span>
                                  {ep.runtimeMinutes ? (
                                    <span className="episode-runtime">
                                      {formatRuntime(ep.runtimeMinutes)}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="episode-play">
                                  {playable
                                    ? playEpisode.isPending
                                      ? bufferStatus || "Starting…"
                                      : "Play"
                                    : "—"}
                                </span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>

          {media ? (
            <aside className="details-aside">
              <dl className="details-facts">
                <div>
                  <dt>Type</dt>
                  <dd>{media.identity.mediaType}</dd>
                </div>
                {media.metadata.year ? (
                  <div>
                    <dt>Year</dt>
                    <dd>{media.metadata.year}</dd>
                  </div>
                ) : null}
                {media.metadata.runtimeMinutes ? (
                  <div>
                    <dt>Runtime</dt>
                    <dd>{formatRuntime(media.metadata.runtimeMinutes)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Availability</dt>
                  <dd>
                    {canPlay
                      ? "Ready to play"
                      : canRequest
                        ? "Requestable"
                        : actionLabel(media)}
                  </dd>
                </div>
              </dl>
            </aside>
          ) : null}
        </main>
      </div>
    </AppChrome>
  );
}
