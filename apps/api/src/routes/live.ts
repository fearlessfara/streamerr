import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";

export async function registerLiveRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/live/groups", async (req) => {
    await requireAuth(req);
    const groups = await ctx.dispatcharr.listChannelGroups();
    return { items: groups };
  });

  app.get("/api/live/channels", async (req) => {
    const { session } = await requireAuth(req);
    const query = z
      .object({
        groupId: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(50),
        favouritesOnly: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional()
          .transform((v) => v === "1" || v === "true"),
      })
      .parse(req.query);

    const favourites = ctx.liveFavourites.list(session.jellyfinUserId);
    const result = await ctx.dispatcharr.listChannels({
      groupId: query.groupId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      favouritesOnly: query.favouritesOnly,
      favouriteUuids: favourites,
    });
    return { ...result, favourites };
  });

  app.get("/api/live/favourites", async (req) => {
    const { session } = await requireAuth(req);
    return { items: ctx.liveFavourites.list(session.jellyfinUserId) };
  });

  app.post("/api/live/favourites/:uuid/toggle", async (req) => {
    const { session } = await requireAuth(req);
    const { uuid } = z.object({ uuid: z.string().uuid() }).parse(req.params);
    return ctx.liveFavourites.toggle(session.jellyfinUserId, uuid);
  });

  app.post("/api/live/now", async (req) => {
    await requireAuth(req);
    const body = z
      .object({
        channelUuids: z.array(z.string().uuid()).max(80),
      })
      .parse(req.body);
    const items = await ctx.dispatcharr.getNowNext(body.channelUuids);
    return { items };
  });

  app.get("/api/live/guide", async (req) => {
    await requireAuth(req);
    const query = z
      .object({
        start: z.string().min(1).optional(),
        end: z.string().min(1).optional(),
      })
      .parse(req.query);
    const start = query.start ?? new Date(Date.now() - 30 * 60_000).toISOString();
    const end = query.end ?? new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const items = await ctx.dispatcharr.getGuideWindow({ start, end });
    return { items, start, end };
  });

  app.post("/api/live/play/:uuid", async (req) => {
    await requireAuth(req);
    const { uuid } = z.object({ uuid: z.string().uuid() }).parse(req.params);
    const source = await ctx.dispatcharr.resolveLivePlayback(uuid);
    if (!source) {
      const err = new Error("Channel not playable") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    const channel = (await ctx.dispatcharr.getChannel?.(uuid)) ?? null;
    return { source, title: channel?.name, channel };
  });
}
