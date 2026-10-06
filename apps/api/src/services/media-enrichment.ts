import type { Media } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import { DispatcharrProvider, type UserContext } from "@streamerr/providers";
import type { AppContext } from "../context.js";
import { lookupDispatcharrIndex, rememberDispatcharrMedia } from "./dispatcharr-index.js";
import { indexedTmdbKeys } from "./vod-catalog-sync.js";

/**
 * Merge Jellyfin + Dispatcharr + Seerr for a TMDb title.
 */
export async function resolveMediaByTmdb(
  ctx: AppContext,
  userContext: UserContext,
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<Media | null> {
  const getDetails = ctx.seerr.getDetails?.bind(ctx.seerr);

  // Seerr + Jellyfin in parallel (Seerr title/year then refine Dispatcharr).
  const seerrPromise = getDetails
    ? getDetails(mediaType, tmdbId).catch(() => null)
    : Promise.resolve(null);
  const jellyfinPromise = ctx.jellyfin
    .findByTmdb(userContext, tmdbId, mediaType)
    .catch(() => null);

  const seerrMedia = await seerrPromise;
  const titleHint = seerrMedia?.metadata.title;
  const yearHint = seerrMedia?.metadata.year;

  const preferredLanguages =
    ctx.dispatcharr instanceof DispatcharrProvider
      ? ctx.dispatcharr.getPreferredLanguages()
      : undefined;
  const indexed = lookupDispatcharrIndex(ctx.db, tmdbId, mediaType, preferredLanguages);

  const [jellyfinMedia, dispatcharrMedia] = await Promise.all([
    jellyfinPromise,
    ctx.dispatcharr
      .findVodByTmdb(tmdbId, mediaType, {
        titleHint,
        yearHint,
        ...(indexed?.dispatcharrId != null ? { dispatcharrId: indexed.dispatcharrId } : {}),
      })
      .catch(() => null),
  ]);

  if (dispatcharrMedia) {
    rememberDispatcharrMedia(ctx.db, dispatcharrMedia);
  }

  if (!seerrMedia && !jellyfinMedia && !dispatcharrMedia) return null;

  const cacheAvail = ctx.acquisitions.cacheAvailabilityFor({ tmdbId, mediaType });

  const availability = [
    ...(jellyfinMedia?.availability ?? []),
    ...(cacheAvail ? [cacheAvail] : []),
    ...(dispatcharrMedia?.availability.filter((a) => a.provider === "dispatcharr") ?? []),
    ...(seerrMedia?.availability.filter((a) => a.provider === "seerr") ?? []),
  ];

  const base = seerrMedia ?? jellyfinMedia ?? dispatcharrMedia!;
  return {
    identity: {
      ...base.identity,
      ...(jellyfinMedia?.identity.jellyfinItemId
        ? { jellyfinItemId: jellyfinMedia.identity.jellyfinItemId }
        : {}),
      tmdbId,
      mediaType,
    },
    metadata: {
      ...base.metadata,
      ...(jellyfinMedia?.metadata.overview && !base.metadata.overview
        ? { overview: jellyfinMedia.metadata.overview }
        : {}),
      posterUrl:
        seerrMedia?.metadata.posterUrl ??
        jellyfinMedia?.metadata.posterUrl ??
        dispatcharrMedia?.metadata.posterUrl ??
        base.metadata.posterUrl,
      backdropUrl:
        seerrMedia?.metadata.backdropUrl ??
        jellyfinMedia?.metadata.backdropUrl ??
        base.metadata.backdropUrl,
      // Prefer Seerr year when Dispatcharr/list rows omit it.
      year: base.metadata.year ?? seerrMedia?.metadata.year ?? jellyfinMedia?.metadata.year,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

/**
 * Attach IPTV (from SQLite index) and optional Jellyfin library membership onto
 * discovery rows. One index lookup for the whole rail — no per-poster Dispatcharr search.
 *
 * Series index hits are marked available but not directly playable (episode-level play).
 * Movies are playable from the card.
 */
export function enrichDiscoveryRow(
  ctx: AppContext,
  items: Media[],
  opts?: {
    /** TMDb ids already known to be in the Jellyfin library (from the library rail). */
    libraryKeys?: Set<string>;
  },
): Media[] {
  const keys = items
    .map((item) => {
      const tmdbId = item.identity.tmdbId;
      const mediaType = item.identity.mediaType;
      if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) return null;
      return { tmdbId, mediaType };
    })
    .filter((k): k is { tmdbId: number; mediaType: "movie" | "tv" } => k != null);

  const indexed = indexedTmdbKeys(ctx.db, keys);
  const libraryKeys = opts?.libraryKeys;
  const preferredLanguages =
    ctx.dispatcharr instanceof DispatcharrProvider
      ? ctx.dispatcharr.getPreferredLanguages()
      : undefined;

  return items.map((item) => {
    const tmdbId = item.identity.tmdbId;
    const mediaType = item.identity.mediaType;
    if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) return item;

    const key = `${mediaType}:${tmdbId}`;
    const onIptv = indexed.has(key);
    const inLibrary = libraryKeys?.has(key) ?? false;

    const indexedHit = onIptv
      ? lookupDispatcharrIndex(ctx.db, tmdbId, mediaType, preferredLanguages)
      : null;

    const jellyfinAvail = inLibrary
      ? ({
          provider: "jellyfin" as const,
          available: true,
          canPlay: true,
        } as const)
      : null;

    const dispatcharrAvail = indexedHit
      ? ({
          provider: "dispatcharr" as const,
          available: true,
          ...(mediaType === "movie"
            ? { movieId: indexedHit.dispatcharrId }
            : { seriesId: indexedHit.dispatcharrId }),
          uuid: indexedHit.uuid,
          tmdbId: String(tmdbId),
          catalogueLanguage: indexedHit.catalogueLanguage ?? undefined,
          candidates: indexedHit.streamId ? [{ streamId: indexedHit.streamId }] : [],
          // Series play is episode-level; movies can start from the card.
          canPlay: mediaType === "movie",
        } as const)
      : null;

    const availability = [
      ...(jellyfinAvail
        ? [jellyfinAvail]
        : item.availability.filter((a) => a.provider === "jellyfin")),
      ...item.availability.filter((a) => a.provider === "cache"),
      ...(dispatcharrAvail
        ? [dispatcharrAvail]
        : item.availability.filter((a) => a.provider === "dispatcharr")),
      ...item.availability.filter((a) => a.provider === "seerr"),
    ];

    return {
      ...item,
      availability,
      preferredAction: resolvePreferredAction(availability),
    };
  });
}

type ArtworkKey = `${"movie" | "tv"}:${number}`;

type CachedArt = {
  posterUrl?: string;
  backdropUrl?: string;
  expiresAt: number;
};

const ART_TTL_MS = 1000 * 60 * 60 * 6;
const artCache = new Map<ArtworkKey, CachedArt>();
const seriesTmdbCache = new Map<string, { tmdbId?: number; expiresAt: number }>();

function artKey(mediaType: "movie" | "tv", tmdbId: number): ArtworkKey {
  return `${mediaType}:${tmdbId}`;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Prefer public TMDb CDN posters/backdrops (via Seerr) over Jellyfin image-proxy URLs.
 * Cuts Streamerr/Jellyfin image load and works on TV Image views that can't send auth headers.
 */
export async function applyTmdbArtwork(
  ctx: AppContext,
  items: Media[],
  userContext?: UserContext,
): Promise<Media[]> {
  if (items.length === 0) return items;
  const getDetails = ctx.seerr.getDetails?.bind(ctx.seerr);
  if (!getDetails) return items;

  const now = Date.now();
  const needed = new Map<ArtworkKey, { mediaType: "movie" | "tv"; tmdbId: number }>();

  const seriesIds = new Set<string>();
  for (const item of items) {
    const { mediaType, tmdbId, jellyfinSeriesId } = item.identity;
    if ((mediaType === "movie" || mediaType === "tv") && tmdbId) {
      const key = artKey(mediaType, tmdbId);
      const hit = artCache.get(key);
      if (!hit || hit.expiresAt < now) needed.set(key, { mediaType, tmdbId });
    } else if (mediaType === "episode" && jellyfinSeriesId) {
      seriesIds.add(jellyfinSeriesId);
    }
  }

  if (userContext && seriesIds.size > 0 && ctx.jellyfin.getByJellyfinItemId) {
    await mapPool([...seriesIds], 4, async (seriesId) => {
      const cached = seriesTmdbCache.get(seriesId);
      if (cached && cached.expiresAt >= now) {
        if (cached.tmdbId) {
          const key = artKey("tv", cached.tmdbId);
          const hit = artCache.get(key);
          if (!hit || hit.expiresAt < now) needed.set(key, { mediaType: "tv", tmdbId: cached.tmdbId });
        }
        return;
      }
      const series = await ctx.jellyfin.getByJellyfinItemId(userContext, seriesId).catch(() => null);
      const seriesTmdb = series?.identity.tmdbId;
      seriesTmdbCache.set(seriesId, { tmdbId: seriesTmdb, expiresAt: now + ART_TTL_MS });
      if (seriesTmdb) {
        const key = artKey("tv", seriesTmdb);
        const hit = artCache.get(key);
        if (!hit || hit.expiresAt < now) needed.set(key, { mediaType: "tv", tmdbId: seriesTmdb });
      }
    });
  }

  await mapPool([...needed.values()], 4, async ({ mediaType, tmdbId }) => {
    const key = artKey(mediaType, tmdbId);
    try {
      const details = await getDetails(mediaType, tmdbId);
      artCache.set(key, {
        posterUrl: details?.metadata.posterUrl,
        backdropUrl: details?.metadata.backdropUrl,
        expiresAt: now + ART_TTL_MS,
      });
    } catch {
      artCache.set(key, { expiresAt: now + 60_000 });
    }
  });

  return items.map((item) => {
    let lookup: ArtworkKey | null = null;
    const { mediaType, tmdbId, jellyfinSeriesId } = item.identity;
    if ((mediaType === "movie" || mediaType === "tv") && tmdbId) {
      lookup = artKey(mediaType, tmdbId);
    } else if (mediaType === "episode" && jellyfinSeriesId) {
      const seriesTmdb = seriesTmdbCache.get(jellyfinSeriesId)?.tmdbId;
      if (seriesTmdb) lookup = artKey("tv", seriesTmdb);
    }
    if (!lookup) return item;
    const art = artCache.get(lookup);
    if (!art?.posterUrl && !art?.backdropUrl) return item;

    return {
      ...item,
      metadata: {
        ...item.metadata,
        posterUrl: art.posterUrl ?? item.metadata.posterUrl,
        backdropUrl: art.backdropUrl ?? item.metadata.backdropUrl,
      },
    };
  });
}

/** @internal test helper */
export function clearTmdbArtworkCache(): void {
  artCache.clear();
  seriesTmdbCache.clear();
}
