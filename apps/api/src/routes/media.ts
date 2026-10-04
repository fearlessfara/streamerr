import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolvePreferredAction, type EpisodeListItem, type Media } from "@streamerr/shared";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { resolveMediaByTmdb } from "../services/media-enrichment.js";

export async function registerMediaRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/media/jellyfin/:itemId", async (req) => {
    const { userContext } = await requireAuth(req);
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(req.params);
    const media = await ctx.jellyfin.getByJellyfinItemId(userContext, itemId);
    if (!media) {
      const err = new Error("Not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    // Enrich with Seerr request state when TMDb is known
    if (
      media.identity.tmdbId &&
      (media.identity.mediaType === "movie" || media.identity.mediaType === "tv")
    ) {
      const seerrAvail = await ctx.seerr
        .getRequestAvailability({
          tmdbId: media.identity.tmdbId,
          mediaType: media.identity.mediaType,
        })
        .catch(() => null);
      if (seerrAvail) {
        const availability = [
          ...media.availability.filter((a) => a.provider !== "seerr"),
          seerrAvail,
        ];
        return {
          media: {
            ...media,
            availability,
            preferredAction: resolvePreferredAction(availability),
          },
        };
      }
    }

    return { media };
  });

  app.get("/api/media/:type/:tmdbId", async (req) => {
    const { userContext } = await requireAuth(req);
    const params = z
      .object({
        type: z.enum(["movie", "tv"]),
        tmdbId: z.coerce.number().int().positive(),
      })
      .parse(req.params);

    const media = await resolveMediaByTmdb(ctx, userContext, params.type, params.tmdbId);
    if (!media) {
      const err = new Error("Not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return { media };
  });

  /** Episode matrix for a series (Jellyfin + Dispatcharr where available). */
  app.get("/api/media/tv/:tmdbId/episodes", async (req) => {
    const { userContext } = await requireAuth(req);
    const { tmdbId } = z
      .object({ tmdbId: z.coerce.number().int().positive() })
      .parse(req.params);

    const series = await resolveMediaByTmdb(ctx, userContext, "tv", tmdbId);
    if (!series) {
      const err = new Error("Series not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    const dispatcharrSeriesId = series.availability.find(
      (a) => a.provider === "dispatcharr",
    )?.seriesId;
    const jellyfinSeriesId =
      series.identity.jellyfinItemId ??
      series.availability.find((a) => a.provider === "jellyfin")?.itemId;

    const [dispatcharrEpisodes, jellyfinEpisodes] = await Promise.all([
      dispatcharrSeriesId && ctx.dispatcharr.listEpisodesForSeries
        ? ctx.dispatcharr
            .listEpisodesForSeries(dispatcharrSeriesId, { seriesTmdbId: tmdbId })
            .catch(() => [] as Media[])
        : Promise.resolve([] as Media[]),
      jellyfinSeriesId && ctx.jellyfin.listEpisodesForSeries
        ? ctx.jellyfin.listEpisodesForSeries(userContext, jellyfinSeriesId).catch(() => [] as Media[])
        : Promise.resolve([] as Media[]),
    ]);

    const byKey = new Map<string, EpisodeListItem>();

    const upsert = (ep: Media) => {
      const seasonNumber = ep.identity.seasonNumber ?? 0;
      const episodeNumber = ep.identity.episodeNumber ?? 0;
      if (!seasonNumber && !episodeNumber && !ep.identity.jellyfinItemId) return;
      const key = `${seasonNumber}:${episodeNumber}`;
      const existing = byKey.get(key);
      const cacheAvail = ctx.acquisitions.cacheAvailabilityFor({
        tmdbId,
        mediaType: "episode",
        seasonNumber,
        episodeNumber,
        ...(ep.identity.jellyfinItemId ? { jellyfinItemId: ep.identity.jellyfinItemId } : {}),
      });
      const availability = [
        ...(existing?.availability ?? []),
        ...ep.availability,
        ...(cacheAvail && !existing?.availability.some((a) => a.provider === "cache")
          ? [cacheAvail]
          : []),
      ];
      // Dedupe by provider
      const seen = new Set<string>();
      const mergedAvail = availability.filter((a) => {
        if (seen.has(a.provider)) return false;
        seen.add(a.provider);
        return true;
      });

      byKey.set(key, {
        identity: {
          ...(existing?.identity ?? {}),
          ...ep.identity,
          ...(existing?.identity.jellyfinItemId
            ? { jellyfinItemId: existing.identity.jellyfinItemId }
            : {}),
          ...(ep.identity.jellyfinItemId ? { jellyfinItemId: ep.identity.jellyfinItemId } : {}),
          tmdbId,
          mediaType: "episode",
          seasonNumber,
          episodeNumber,
        },
        title: existing?.title ?? ep.metadata.title,
        overview: existing?.overview ?? ep.metadata.overview,
        seasonNumber,
        episodeNumber,
        runtimeMinutes: ep.metadata.runtimeMinutes ?? existing?.runtimeMinutes,
        availability: mergedAvail,
        preferredAction: resolvePreferredAction(mergedAvail),
      });
    };

    // Jellyfin first so IPTV can enrich without overwriting library ids.
    for (const ep of jellyfinEpisodes) upsert(ep);
    for (const ep of dispatcharrEpisodes) upsert(ep);

    const items = [...byKey.values()].sort(
      (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
    );
    const seasons = [...new Set(items.map((i) => i.seasonNumber))].sort((a, b) => a - b);

    return {
      series,
      seasons,
      items,
    };
  });
}
