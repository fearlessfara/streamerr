import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolvePreferredAction, type Media } from "@streamerr/shared";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { resolveMediaByTmdb } from "../services/media-enrichment.js";
import { mergeSeriesEpisodes } from "../services/series-episodes.js";

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

  /** Episode guide from Seerr, with Jellyfin and IPTV VOD playability overlaid per episode. */
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

    const [guide, dispatcharrEpisodes, jellyfinEpisodes] = await Promise.all([
      ctx.seerr
        .listTvEpisodes(tmdbId)
        .catch(() => [] as Media[]),
      dispatcharrSeriesId && ctx.dispatcharr.listEpisodesForSeries
        ? ctx.dispatcharr
            .listEpisodesForSeries(dispatcharrSeriesId, { seriesTmdbId: tmdbId })
            .catch(() => [] as Media[])
        : Promise.resolve([] as Media[]),
      jellyfinSeriesId && ctx.jellyfin.listEpisodesForSeries
        ? ctx.jellyfin.listEpisodesForSeries(userContext, jellyfinSeriesId).catch(() => [] as Media[])
        : Promise.resolve([] as Media[]),
    ]);

    const { seasons, items } = mergeSeriesEpisodes(
      tmdbId,
      { guide, jellyfin: jellyfinEpisodes, iptv: dispatcharrEpisodes },
      (identity) =>
        ctx.acquisitions.cacheAvailabilityFor({
          tmdbId,
          mediaType: "episode",
          seasonNumber: identity.seasonNumber,
          episodeNumber: identity.episodeNumber,
          ...(identity.jellyfinItemId ? { jellyfinItemId: identity.jellyfinItemId } : {}),
        }),
    );

    return {
      series,
      seasons,
      items,
    };
  });
}
