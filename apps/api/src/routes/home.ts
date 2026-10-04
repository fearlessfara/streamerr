import type { FastifyInstance } from "fastify";
import type { Media } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import type { UserContext } from "@streamerr/providers";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { jellyfinTmdbIndex } from "../db/schema.js";
import { IptvProgressStore } from "../services/iptv-progress.js";

/** Prefer a real next episode from Dispatcharr/Jellyfin catalogues (handles season wrap). */
async function refineIptvNextUp(
  ctx: AppContext,
  userContext: UserContext,
  items: Media[],
): Promise<Media[]> {
  const out: Media[] = [];
  for (const item of items) {
    const tmdbId = item.identity.tmdbId;
    const season = item.identity.seasonNumber;
    const episode = item.identity.episodeNumber;
    if (tmdbId == null || season == null || episode == null) {
      out.push(item);
      continue;
    }
    // listNextUp already computed episode+1 — try that, then season+1 E1.
    const candidates = [
      { seasonNumber: season, episodeNumber: episode },
      { seasonNumber: season + 1, episodeNumber: 1 },
    ];
    let resolved: Media | null = null;
    for (const c of candidates) {
      const dispatcharr = ctx.dispatcharr as {
        findEpisodeBySeriesTmdb?: (
          seriesTmdbId: number,
          seasonNumber: number,
          episodeNumber: number,
          opts?: { titleHint?: string },
        ) => Promise<Media | null>;
      };
      if (dispatcharr.findEpisodeBySeriesTmdb) {
        resolved = await dispatcharr
          .findEpisodeBySeriesTmdb(tmdbId, c.seasonNumber, c.episodeNumber, {
            titleHint: item.metadata.title?.replace(/\s*S\d+E\d+\s*$/i, "").trim(),
          })
          .catch(() => null);
        if (resolved) break;
      }
      if (!resolved && ctx.jellyfin.listEpisodesForSeries) {
        const series = await ctx.jellyfin.findByTmdb(userContext, tmdbId, "tv").catch(() => null);
        const seriesId = series?.identity.jellyfinItemId;
        if (seriesId) {
          const eps = await ctx.jellyfin
            .listEpisodesForSeries(userContext, seriesId)
            .catch(() => []);
          const hit = eps.find(
            (e) =>
              e.identity.seasonNumber === c.seasonNumber &&
              e.identity.episodeNumber === c.episodeNumber,
          );
          if (hit) {
            resolved = hit;
            break;
          }
        }
      }
    }
    if (!resolved) continue; // drop suggestions that do not exist
    const availability = [
      ...resolved.availability,
      {
        provider: "dispatcharr" as const,
        available: true,
        canPlay: true,
        candidates: [],
      },
    ];
    out.push({
      ...resolved,
      availability,
      preferredAction: resolvePreferredAction(availability),
      metadata: {
        ...resolved.metadata,
        posterUrl: resolved.metadata.posterUrl ?? item.metadata.posterUrl,
      },
    });
  }
  return out;
}

export async function registerHomeRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const iptvProgress = new IptvProgressStore(ctx.db);

  app.get("/api/home", async (req) => {
    const { userContext, session } = await requireAuth(req);

    const [continueWatching, nextUp, recentlyAdded, trending] = await Promise.all([
      ctx.jellyfin.getContinueWatching(userContext).catch(() => []),
      ctx.jellyfin.getNextUp(userContext).catch(() => []),
      ctx.jellyfin.getRecentlyAdded(userContext).catch(() => []),
      ctx.seerr.discoverTrending({ page: 1 }).catch(() => []),
    ]);
    const iptvContinue = iptvProgress.listContinue(session.jellyfinUserId);
    const iptvNextUpRaw = iptvProgress.listNextUp(session.jellyfinUserId);
    const iptvNextUp = await refineIptvNextUp(ctx, userContext, iptvNextUpRaw);

    for (const media of [...continueWatching, ...recentlyAdded]) {
      if (media.identity.jellyfinItemId && media.identity.tmdbId) {
        try {
          ctx.db
            .insert(jellyfinTmdbIndex)
            .values({
              jellyfinItemId: media.identity.jellyfinItemId,
              tmdbId: media.identity.tmdbId,
              mediaType: media.identity.mediaType,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: jellyfinTmdbIndex.jellyfinItemId,
              set: {
                tmdbId: media.identity.tmdbId,
                mediaType: media.identity.mediaType,
                updatedAt: new Date(),
              },
            })
            .run();
        } catch {
          // ignore index failures
        }
      }
    }

    // Prefer Jellyfin CW, then append IPTV resumes for different titles/episodes.
    const continueKey = (m: { identity: { tmdbId?: number; mediaType: string; seasonNumber?: number; episodeNumber?: number } }) => {
      const id = m.identity;
      if (id.mediaType === "episode") {
        return `ep:${id.tmdbId ?? ""}:${id.seasonNumber ?? ""}:${id.episodeNumber ?? ""}`;
      }
      return `${id.mediaType}:${id.tmdbId ?? ""}`;
    };
    const jfKeys = new Set(continueWatching.map(continueKey));
    const mergedContinue = [
      ...continueWatching,
      ...iptvContinue.filter((m) => !jfKeys.has(continueKey(m))),
    ];

    const nextKeys = new Set(
      nextUp.map(
        (m) =>
          `${m.identity.tmdbId ?? ""}:${m.identity.seasonNumber ?? ""}:${m.identity.episodeNumber ?? ""}`,
      ),
    );
    const mergedNextUp = [
      ...nextUp,
      ...iptvNextUp.filter((m) => {
        const key = `${m.identity.tmdbId ?? ""}:${m.identity.seasonNumber ?? ""}:${m.identity.episodeNumber ?? ""}`;
        return !nextKeys.has(key);
      }),
    ];

    return {
      rows: [
        { id: "continue", title: "Continue Watching", items: mergedContinue },
        { id: "nextup", title: "Next Up", items: mergedNextUp },
        { id: "recent", title: "Recently Added", items: recentlyAdded },
        { id: "trending", title: "Trending", items: trending },
      ],
    };
  });
}
