import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { MediaIdentitySchema, toWebVtt } from "@streamerr/shared";
import { DispatcharrProvider, JellyfinProvider } from "@streamerr/providers";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { IptvProgressStore } from "../services/iptv-progress.js";
import {
  remuxToBrowserMp4,
  remuxToBrowserMp4FromFile,
  remuxToBrowserMp4FromUrl,
  webStreamToNode,
} from "../services/ffmpeg-remux.js";

export async function registerPlaybackRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  const iptvProgress = new IptvProgressStore(ctx.db);

  app.post("/api/playback/resolve", async (req) => {
    const { userContext } = await requireAuth(req);
    const body = z
      .object({
        identity: MediaIdentitySchema,
      })
      .parse(req.body);

    const result = await ctx.playbackResolver.resolve(userContext, body.identity);
    if (!result) {
      const err = new Error("No playable source") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return result;
  });

  app.post("/api/playback/progress", async (req) => {
    const { userContext } = await requireAuth(req);
    const body = z
      .object({
        itemId: z.string().min(1),
        positionSeconds: z.number().nonnegative(),
        isPaused: z.boolean().optional(),
        playSessionId: z.string().optional(),
        mediaSourceId: z.string().optional(),
        event: z.enum(["start", "progress", "stopped"]),
      })
      .parse(req.body);

    await ctx.jellyfin.reportProgress(userContext, body);
    return { ok: true };
  });

  /** Persist IPTV / cache watch position for Continue Watching. */
  app.post("/api/playback/iptv-progress", async (req) => {
    const { session } = await requireAuth(req);
    const body = z
      .object({
        identity: MediaIdentitySchema,
        positionSeconds: z.number().nonnegative(),
        durationSeconds: z.number().nonnegative().optional(),
        event: z.enum(["start", "progress", "stopped"]).default("progress"),
        title: z.string().optional(),
      })
      .parse(req.body);

    const duration = body.durationSeconds;
    const completed =
      duration !== undefined &&
      duration > 0 &&
      body.positionSeconds / duration >= 0.9;

    iptvProgress.upsert(session.jellyfinUserId, {
      identity: body.identity,
      positionSeconds: body.positionSeconds,
      durationSeconds: duration,
      title: body.title,
      completed,
      // "start" at 0 must not wipe a saved Continue Watching position.
      preserveHigherPosition: body.event === "start" || body.positionSeconds < 5,
    });
    return { ok: true };
  });

  app.get("/api/playback/jellyfin/stream/:itemId", async (req, reply) => {
    const { userContext } = await requireAuth(req);
    const params = z.object({ itemId: z.string().min(1) }).parse(req.params);
    const query = z
      .object({
        mediaSourceId: z.string().min(1),
        playMethod: z.enum(["DirectPlay", "DirectStream", "Transcode"]).optional(),
        playSessionId: z.string().optional(),
        audioStreamIndex: z.coerce.number().optional(),
        transcodingPath: z.string().optional(),
      })
      .parse(req.query);

    if (ctx.useMocks || !(ctx.jellyfin instanceof JellyfinProvider)) {
      reply.header("Content-Type", "text/plain");
      return reply.send("Mock stream — configure JELLYFIN_URL for real playback.");
    }

    if (query.transcodingPath) {
      const path = query.transcodingPath;
      if (path.includes("://") || path.includes("..")) {
        return reply.status(400).send({ error: "Invalid transcoding path" });
      }
    }

    const abort = new AbortController();
    reply.raw.on("close", () => abort.abort());
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;

    const upstream = await ctx.jellyfin.openStream(userContext, params.itemId, {
      mediaSourceId: query.mediaSourceId,
      playMethod: query.playMethod,
      playSessionId: query.playSessionId,
      audioStreamIndex: query.audioStreamIndex,
      transcodingPath: query.transcodingPath,
      range: rangeHeader,
      signal: abort.signal,
    });

    const ct = upstream.headers.get("content-type") ?? "";
    const isPlaylist =
      ct.includes("mpegurl") ||
      ct.includes("m3u8") ||
      (query.transcodingPath?.includes(".m3u8") ?? false) ||
      query.playMethod === "Transcode";

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewriteHlsPlaylist(text, params.itemId, query);
      reply.header("Content-Type", "application/vnd.apple.mpegurl");
      reply.header("Cache-Control", "no-cache");
      return reply.send(rewritten);
    }

    reply.status(upstream.status);
    if (ct) reply.header("Content-Type", ct);
    const cl = upstream.headers.get("content-length");
    if (cl) reply.header("Content-Length", cl);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) reply.header("Content-Range", contentRange);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) reply.header("Accept-Ranges", acceptRanges);

    if (!upstream.body) {
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    }
    return reply.send(upstream.body);
  });

  /** Serve a local acquisition file (cache / library download). */
  app.get("/api/playback/cache/:id", async (req, reply) => {
    await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const query = z
      .object({
        /** Skip AAC remux (debug only) — raw MKV often has silent AC3 in Chrome. */
        raw: z
          .enum(["0", "1", "true", "false"])
          .optional()
          .transform((v) => v === "1" || v === "true"),
        /** Remux seek offset in seconds (scrubbing for fMP4 remux). */
        start: z.coerce.number().nonnegative().optional(),
      })
      .parse(req.query);
    const meta = ctx.acquisitions.openLocalFileMeta(id);
    if (!meta) {
      return reply.status(404).send({ error: "Cache file not ready" });
    }
    ctx.cacheManager.touch(id);

    if (query.raw) {
      const file = ctx.acquisitions.openLocalFile(id);
      if (!file) return reply.status(404).send({ error: "Cache file not ready" });
      reply.header("Content-Type", "video/x-matroska");
      reply.header("Content-Length", String(file.size));
      // Do not advertise Accept-Ranges unless we honor Range (players break otherwise).
      reply.header("Cache-Control", "no-store");
      return reply.send(file.stream);
    }

    // Remux from path so `-ss` can seek for scrubbing.
    const { stream, proc } = remuxToBrowserMp4FromFile(meta.path, {
      startSeconds: query.start,
    });
    reply.raw.on("close", () => {
      try {
        if (!proc.killed) proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    });
    reply.header("Content-Type", "video/mp4");
    reply.header("Cache-Control", "no-store");
    reply.header("X-Streamerr-Remux", "aac-mp4");
    if (query.start) reply.header("X-Streamerr-Start", String(query.start));
    return reply.send(stream);
  });

  /**
   * Proxies Dispatcharr live MPEG-TS using Streamerr-held auth.
   * Streamed with minimal buffering so mpegts.js can absorb jitter client-side.
   */
  app.get("/api/playback/dispatcharr/live/:uuid", async (req, reply) => {
    await requireAuth(req);
    const params = z.object({ uuid: z.string().uuid() }).parse(req.params);

    if (ctx.useMocks || !(ctx.dispatcharr instanceof DispatcharrProvider)) {
      reply.header("Content-Type", "text/plain");
      return reply.send("Mock live stream — configure DISPATCHARR auth for real playback.");
    }

    const lease = ctx.iptvConnections.acquire("live", { label: `live:${params.uuid}` });
    const cleanup = () => lease.release();
    reply.raw.on("close", cleanup);

    try {
      const upstream = await ctx.dispatcharr.openLiveStream({
        uuid: params.uuid,
        signal: lease.signal,
      });
      if (!upstream.ok) {
        cleanup();
        const errText = await upstream.text().catch(() => "");
        return reply.status(upstream.status).send({
          error: errText || `Dispatcharr live stream failed (${upstream.status})`,
        });
      }

      reply.status(upstream.status);
      reply.header("Content-Type", upstream.headers.get("content-type") ?? "video/mp2t");
      reply.header("Cache-Control", "no-store, no-transform");
      reply.header("X-Accel-Buffering", "no");
      if (!upstream.body) {
        cleanup();
        return reply.send(Buffer.from(await upstream.arrayBuffer()));
      }
      // Abort the body when the lease is preempted (channel zap / connection cap).
      lease.signal.addEventListener(
        "abort",
        () => {
          try {
            void upstream.body?.cancel();
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
      return reply.send(upstream.body);
    } catch (err) {
      cleanup();
      throw err;
    }
  });

  /**
   * Proxies Dispatcharr VOD using Streamerr-held auth.
   * Browser never sees Dispatcharr credentials or raw IPTV URLs.
   *
   * Default: remux to fragmented MP4 with AAC audio. Upstream IPTV VOD is often
   * Matroska + AC3/DTS — Chrome plays video and silently drops that audio.
   */
  app.get("/api/playback/dispatcharr/vod/:uuid", async (req, reply) => {
    await requireAuth(req);
    const params = z.object({ uuid: z.string().uuid() }).parse(req.params);
    const query = z
      .object({
        kind: z.enum(["movie", "episode"]).default("movie"),
        streamId: z.string().optional(),
        /** Skip AAC remux (debug only). */
        raw: z
          .enum(["0", "1", "true", "false"])
          .optional()
          .transform((v) => v === "1" || v === "true"),
        /** Remux seek offset in seconds. */
        start: z.coerce.number().nonnegative().optional(),
      })
      .parse(req.query);

    if (ctx.useMocks || !(ctx.dispatcharr instanceof DispatcharrProvider)) {
      reply.header("Content-Type", "text/plain");
      return reply.send("Mock Dispatcharr stream — configure DISPATCHARR auth for real playback.");
    }

    const lease = ctx.iptvConnections.acquire("playback", {
      label: `vod:${params.uuid}`,
    });
    let killRemux: (() => void) | undefined;
    const cleanup = () => {
      killRemux?.();
      lease.release();
    };
    reply.raw.on("close", cleanup);

    try {
      reply.header("Cache-Control", "no-store");

      // Scrub seeks: ffmpeg input-seek against the authenticated upstream URL.
      // Pipe+discard from t=0 is too slow and flakes with connection limits.
      if (!query.raw && query.start != null && query.start > 0) {
        const target = await ctx.dispatcharr.resolveVodStreamTarget({
          uuid: params.uuid,
          kind: query.kind,
          streamId: query.streamId,
        });
        const { stream, proc } = remuxToBrowserMp4FromUrl(target.url, target.headers, {
          startSeconds: query.start,
          signal: lease.signal,
        });
        killRemux = () => {
          try {
            if (!proc.killed) proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        };
        reply.status(200);
        reply.header("Content-Type", "video/mp4");
        reply.header("X-Streamerr-Remux", "aac-mp4");
        reply.header("X-Streamerr-Start", String(query.start));
        return reply.send(stream);
      }

      const upstream = await ctx.dispatcharr.openVodStream({
        uuid: params.uuid,
        kind: query.kind,
        streamId: query.streamId,
        signal: lease.signal,
      });

      if (!upstream.ok) {
        cleanup();
        const errText = await upstream.text().catch(() => "");
        return reply.status(upstream.status).send({
          error: errText || `Dispatcharr stream failed (${upstream.status})`,
        });
      }

      if (query.raw) {
        reply.status(upstream.status);
        const ct = upstream.headers.get("content-type");
        if (ct) reply.header("Content-Type", ct);
        const cl = upstream.headers.get("content-length");
        if (cl) reply.header("Content-Length", cl);
        const acceptRanges = upstream.headers.get("accept-ranges");
        if (acceptRanges) reply.header("Accept-Ranges", acceptRanges);
        if (!upstream.body) {
          cleanup();
          return reply.send(Buffer.from(await upstream.arrayBuffer()));
        }
        return reply.send(upstream.body);
      }

      if (!upstream.body) {
        cleanup();
        return reply.status(502).send({ error: "Upstream VOD returned an empty body" });
      }

      const { stream, proc } = remuxToBrowserMp4(webStreamToNode(upstream.body), {
        startSeconds: query.start,
        signal: lease.signal,
      });
      killRemux = () => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      };
      reply.status(200);
      reply.header("Content-Type", "video/mp4");
      reply.header("X-Streamerr-Remux", "aac-mp4");
      if (query.start) reply.header("X-Streamerr-Start", String(query.start));
      return reply.send(stream);
    } catch (err) {
      cleanup();
      throw err;
    }
  });

  /** Text subtitles Jellyfin already indexed (including Bazarr sidecars). */
  app.get("/api/playback/jellyfin/subtitle/:itemId/:index", async (req, reply) => {
    const { userContext } = await requireAuth(req);
    const params = z
      .object({
        itemId: z.string().min(1),
        index: z.coerce.number().int().nonnegative(),
      })
      .parse(req.params);
    const query = z.object({ mediaSourceId: z.string().min(1) }).parse(req.query);

    if (ctx.useMocks || !(ctx.jellyfin instanceof JellyfinProvider)) {
      return reply.status(404).send({ error: "Subtitles are not available in mock mode" });
    }

    const upstream = await ctx.jellyfin.openSubtitle(
      userContext,
      params.itemId,
      query.mediaSourceId,
      params.index,
    );
    const text = await upstream.text();
    reply.header("Content-Type", "text/vtt; charset=utf-8");
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(toWebVtt(text));
  });

  app.get("/api/playback/bazarr/movie/:id/:index", async (req, reply) => {
    await requireAuth(req);
    const params = z
      .object({
        id: z.coerce.number().int().positive(),
        index: z.coerce.number().int().nonnegative(),
      })
      .parse(req.params);
    return sendBazarrSubtitle(ctx, reply, "movie", params.id, params.index);
  });

  app.get("/api/playback/bazarr/episode/:seriesId/:id/:index", async (req, reply) => {
    await requireAuth(req);
    const params = z
      .object({
        seriesId: z.coerce.number().int().positive(),
        id: z.coerce.number().int().positive(),
        index: z.coerce.number().int().nonnegative(),
      })
      .parse(req.params);
    return sendBazarrSubtitle(ctx, reply, "episode", params.id, params.index, params.seriesId);
  });

  /** Proxies HLS segments / nested playlists from Jellyfin. */
  app.get("/api/playback/jellyfin/hls", async (req, reply) => {
    const { userContext } = await requireAuth(req);
    const query = z.object({ path: z.string().min(1) }).parse(req.query);

    if (ctx.useMocks || !(ctx.jellyfin instanceof JellyfinProvider)) {
      return reply.status(404).send({ error: "Not available in mock mode" });
    }

    // Only allow relative Jellyfin media paths — block open proxies / SSRF.
    const path = query.path;
    if (path.includes("://") || path.includes("..")) {
      return reply.status(400).send({ error: "Invalid path" });
    }

    const abort = new AbortController();
    reply.raw.on("close", () => abort.abort());
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;

    const upstream = await ctx.jellyfin.openStream(userContext, "hls", {
      mediaSourceId: "hls",
      jellyfinPath: path.startsWith("/") ? path : `/${path}`,
      range: rangeHeader,
      signal: abort.signal,
    });

    const ct = upstream.headers.get("content-type") ?? "";
    if (ct.includes("mpegurl") || path.includes(".m3u8")) {
      const text = await upstream.text();
      const rewritten = rewriteHlsPlaylist(text, "hls", { path });
      reply.header("Content-Type", "application/vnd.apple.mpegurl");
      reply.header("Cache-Control", "no-cache");
      return reply.send(rewritten);
    }

    reply.status(upstream.status);
    if (ct) reply.header("Content-Type", ct);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) reply.header("Content-Range", contentRange);
    if (!upstream.body) {
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    }
    return reply.send(upstream.body);
  });
}

async function sendBazarrSubtitle(
  ctx: AppContext,
  reply: FastifyReply,
  kind: "movie" | "episode",
  mediaId: number,
  index: number,
  seriesId?: number,
) {
  if (!ctx.bazarr.isConfigured()) {
    return reply.status(404).send({ error: "Bazarr is not configured" });
  }
  const file = await ctx.bazarr.readSubtitle(kind, mediaId, index, seriesId);
  if (!file) return reply.status(404).send({ error: "Subtitle not found" });
  reply.header("Content-Type", "text/vtt; charset=utf-8");
  reply.header("Cache-Control", "private, max-age=3600");
  return reply.send(toWebVtt(file));
}

function rewriteHlsPlaylist(
  playlist: string,
  itemId: string,
  context: {
    mediaSourceId?: string;
    playMethod?: string;
    playSessionId?: string;
    transcodingPath?: string;
    path?: string;
  },
): string {
  const baseDir = (() => {
    const raw = context.transcodingPath ?? context.path ?? "";
    const withoutQuery = raw.split("?")[0] ?? "";
    const idx = withoutQuery.lastIndexOf("/");
    return idx >= 0 ? withoutQuery.slice(0, idx + 1) : "/";
  })();

  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Rewrite URI="..." attributes in tags
        if (trimmed.includes("URI=")) {
          return trimmed.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
            return `URI="${toHlsProxyUrl(resolveJellyfinUri(uri, baseDir))}"`;
          });
        }
        return line;
      }
      return toHlsProxyUrl(resolveJellyfinUri(trimmed, baseDir));
    })
    .join("\n");
}

function resolveJellyfinUri(uri: string, baseDir: string): string {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      const u = new URL(uri);
      return `${u.pathname}${u.search}`;
    } catch {
      return uri;
    }
  }
  if (uri.startsWith("/")) return uri;
  return `${baseDir}${uri}`;
}

function toHlsProxyUrl(jellyfinPath: string): string {
  return `/api/playback/jellyfin/hls?path=${encodeURIComponent(jellyfinPath)}`;
}
