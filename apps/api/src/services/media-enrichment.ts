import type { Media } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import { DispatcharrProvider, type UserContext } from "@streamerr/providers";
import type { AppContext } from "../context.js";
import { lookupDispatcharrIndex, rememberDispatcharrMedia } from "./dispatcharr-index.js";

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

/** Attach Jellyfin playability onto discovery rows when already in library. */
export async function enrichDiscoveryRow(
  ctx: AppContext,
  userContext: UserContext,
  items: Media[],
): Promise<Media[]> {
  return Promise.all(
    items.map(async (item) => {
      const tmdbId = item.identity.tmdbId;
      const mediaType = item.identity.mediaType;
      if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) return item;

      const jellyfin = await ctx.jellyfin
        .findByTmdb(userContext, tmdbId, mediaType)
        .catch(() => null);
      if (!jellyfin) return item;

      const availability = [
        ...jellyfin.availability,
        ...item.availability.filter((a) => a.provider !== "jellyfin"),
      ];
      return {
        ...item,
        identity: {
          ...item.identity,
          jellyfinItemId: jellyfin.identity.jellyfinItemId,
        },
        availability,
        preferredAction: resolvePreferredAction(availability),
      };
    }),
  );
}
