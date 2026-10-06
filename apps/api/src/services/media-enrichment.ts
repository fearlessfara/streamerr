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
        base.metadata.posterUrl ??
        jellyfinMedia?.metadata.posterUrl ??
        dispatcharrMedia?.metadata.posterUrl,
      backdropUrl: base.metadata.backdropUrl ?? jellyfinMedia?.metadata.backdropUrl,
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
