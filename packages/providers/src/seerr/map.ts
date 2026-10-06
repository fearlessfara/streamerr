import type { Media, MediaIdentity, RequestAvailability } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import {
  MEDIA_STATUS_LABEL,
  REQUEST_STATUS_LABEL,
  SeerrMediaStatus,
  type SeerrMediaInfo,
  type SeerrMovieDetails,
  type SeerrSearchResult,
  type SeerrTvDetails,
  type SeerrTvEpisode,
} from "./schemas.js";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export function tmdbImageUrl(
  path: string | null | undefined,
  size: "w300" | "w500" | "w1280",
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path.replace("/original/", `/${size}/`);
  return `${TMDB_IMG}/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

function yearFromDate(date?: string | null): number | undefined {
  if (!date || date.length < 4) return undefined;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : undefined;
}

export function mapMediaInfoToRequestAvailability(
  mediaInfo?: SeerrMediaInfo | null,
): RequestAvailability {
  const mediaStatusNum = mediaInfo?.status ?? SeerrMediaStatus.UNKNOWN;
  const mediaStatus = MEDIA_STATUS_LABEL[mediaStatusNum] ?? "UNKNOWN";

  const latestRequest = mediaInfo?.requests?.[0];
  const requestStatus =
    latestRequest?.status !== undefined
      ? (REQUEST_STATUS_LABEL[latestRequest.status] ?? String(latestRequest.status))
      : undefined;

  const availableInLibrary =
    mediaStatusNum === SeerrMediaStatus.AVAILABLE ||
    mediaStatusNum === SeerrMediaStatus.PARTIALLY_AVAILABLE;

  const blocked = mediaStatusNum === SeerrMediaStatus.BLOCKLISTED;
  const alreadyPending =
    mediaStatusNum === SeerrMediaStatus.PENDING ||
    mediaStatusNum === SeerrMediaStatus.PROCESSING ||
    requestStatus === "PENDING" ||
    requestStatus === "APPROVED";

  return {
    provider: "seerr",
    requestable: !blocked && !availableInLibrary && !alreadyPending,
    requestStatus,
    mediaStatus,
  };
}

export function mapSearchResultToMedia(result: SeerrSearchResult): Media | null {
  if (result.mediaType !== "movie" && result.mediaType !== "tv") return null;

  const title =
    result.mediaType === "movie"
      ? (result.title ?? result.originalTitle ?? "Untitled")
      : (result.name ?? result.originalName ?? "Untitled");

  const date = result.mediaType === "movie" ? result.releaseDate : result.firstAirDate;
  const seerrAvail = mapMediaInfoToRequestAvailability(result.mediaInfo);
  const availability = [seerrAvail];

  return {
    identity: {
      tmdbId: result.id,
      mediaType: result.mediaType,
      ...(result.mediaInfo?.tvdbId ? { tvdbId: result.mediaInfo.tvdbId } : {}),
    },
    metadata: {
      title,
      originalTitle:
        result.mediaType === "movie" ? result.originalTitle : result.originalName,
      year: yearFromDate(date),
      overview: result.overview ?? undefined,
      posterUrl: tmdbImageUrl(result.posterPath, "w500"),
      backdropUrl: tmdbImageUrl(result.backdropPath, "w1280"),
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

export function mapMovieDetailsToMedia(details: SeerrMovieDetails): Media {
  const seerrAvail = mapMediaInfoToRequestAvailability(details.mediaInfo);
  const availability = [seerrAvail];
  return {
    identity: {
      tmdbId: details.id,
      mediaType: "movie",
      ...(details.mediaInfo?.tvdbId ? { tvdbId: details.mediaInfo.tvdbId } : {}),
    },
    metadata: {
      title: details.title,
      originalTitle: details.originalTitle,
      year: yearFromDate(details.releaseDate),
      overview: details.overview ?? undefined,
      posterUrl: tmdbImageUrl(details.posterPath, "w500"),
      backdropUrl: tmdbImageUrl(details.backdropPath, "w1280"),
      runtimeMinutes: details.runtime ?? undefined,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

export function mapTvDetailsToMedia(details: SeerrTvDetails): Media {
  const seerrAvail = mapMediaInfoToRequestAvailability(details.mediaInfo);
  const availability = [seerrAvail];
  return {
    identity: {
      tmdbId: details.id,
      mediaType: "tv",
      ...(details.mediaInfo?.tvdbId ? { tvdbId: details.mediaInfo.tvdbId } : {}),
    },
    metadata: {
      title: details.name,
      originalTitle: details.originalName,
      year: yearFromDate(details.firstAirDate),
      overview: details.overview ?? undefined,
      posterUrl: tmdbImageUrl(details.posterPath, "w500"),
      backdropUrl: tmdbImageUrl(details.backdropPath, "w1280"),
      runtimeMinutes: details.episodeRunTime?.find((n) => n > 0),
      genres: details.genres?.map((g) => g.name).filter(Boolean),
      seriesStatus: details.status || undefined,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

/** One TMDb episode row. Playability is filled in later from Jellyfin and IPTV. */
export function mapSeerrEpisodeToMedia(
  episode: SeerrTvEpisode,
  seriesTmdbId: number,
  seasonNumber: number,
  seasonStatus?: number,
): Media {
  const seerrAvail = mapMediaInfoToRequestAvailability(
    seasonStatus != null ? { status: seasonStatus } : null,
  );
  const availability = [seerrAvail];
  const episodeNumber = episode.episodeNumber;
  return {
    identity: {
      tmdbId: seriesTmdbId,
      mediaType: "episode",
      seasonNumber: episode.seasonNumber ?? seasonNumber,
      episodeNumber,
    },
    metadata: {
      title: episode.name?.trim() || `Episode ${episodeNumber}`,
      overview: episode.overview ?? undefined,
      runtimeMinutes: episode.runtime && episode.runtime > 0 ? episode.runtime : undefined,
      stillUrl: tmdbImageUrl(episode.stillPath, "w300"),
      airDate: episode.airDate ?? undefined,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

export function identityNeedsTmdb(identity: MediaIdentity): identity is MediaIdentity & {
  tmdbId: number;
  mediaType: "movie" | "tv";
} {
  return (
    typeof identity.tmdbId === "number" &&
    (identity.mediaType === "movie" || identity.mediaType === "tv")
  );
}
