import { and, desc, eq } from "drizzle-orm";
import type { Media, MediaIdentity } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import type { AppDb } from "../db/client.js";
import { playbackProgress } from "../db/schema.js";

function progressId(userId: string, identity: MediaIdentity): string {
  const base = `${userId}:${identity.mediaType}:${identity.tmdbId ?? "x"}`;
  if (identity.mediaType === "episode") {
    return `${base}:s${identity.seasonNumber ?? 0}e${identity.episodeNumber ?? 0}`;
  }
  return base;
}

function rowToMedia(row: typeof playbackProgress.$inferSelect): Media {
  const identity: MediaIdentity = {
    tmdbId: row.tmdbId ?? undefined,
    mediaType: row.mediaType as MediaIdentity["mediaType"],
    seasonNumber: row.seasonNumber ?? undefined,
    episodeNumber: row.episodeNumber ?? undefined,
  };
  const fallbackTitle =
    identity.mediaType === "episode"
      ? `S${identity.seasonNumber ?? 0}E${identity.episodeNumber ?? 0}`
      : `Title ${identity.tmdbId}`;
  const availability = [
    {
      provider: "dispatcharr" as const,
      available: true,
      canPlay: true,
      candidates: [],
      positionSeconds: row.positionSeconds,
      durationSeconds: row.durationSeconds ?? undefined,
    },
  ];
  return {
    identity,
    metadata: {
      title: row.title?.trim() || fallbackTitle,
      posterUrl: row.posterUrl ?? undefined,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}

export class IptvProgressStore {
  constructor(private readonly db: AppDb) {}

  get(
    userId: string,
    identity: MediaIdentity,
  ): { positionSeconds: number; durationSeconds?: number; completed: boolean } | null {
    if (!identity.tmdbId) return null;
    const id = progressId(userId, identity);
    const row = this.db
      .select()
      .from(playbackProgress)
      .where(eq(playbackProgress.id, id))
      .all()[0];
    if (!row) return null;
    return {
      positionSeconds: row.positionSeconds,
      durationSeconds: row.durationSeconds ?? undefined,
      completed: Boolean(row.completed),
    };
  }

  upsert(
    userId: string,
    input: {
      identity: MediaIdentity;
      positionSeconds: number;
      durationSeconds?: number;
      title?: string;
      posterUrl?: string;
      completed?: boolean;
      /** When true, do not overwrite a larger stored position with 0 / a smaller value. */
      preserveHigherPosition?: boolean;
    },
  ): void {
    if (!input.identity.tmdbId) return;
    const id = progressId(userId, input.identity);
    const now = new Date();
    const incoming = Math.max(0, Math.floor(input.positionSeconds));
    const existing = this.get(userId, input.identity);
    const positionSeconds =
      input.preserveHigherPosition && existing && existing.positionSeconds > incoming
        ? existing.positionSeconds
        : incoming;
    const completed =
      input.completed !== undefined
        ? Boolean(input.completed)
        : Boolean(existing?.completed);
    this.db
      .insert(playbackProgress)
      .values({
        id,
        userId,
        tmdbId: input.identity.tmdbId,
        mediaType: input.identity.mediaType,
        seasonNumber: input.identity.seasonNumber,
        episodeNumber: input.identity.episodeNumber,
        provider: "dispatcharr",
        positionSeconds,
        durationSeconds:
          input.durationSeconds !== undefined
            ? Math.floor(input.durationSeconds)
            : existing?.durationSeconds,
        completed,
        title: input.title,
        posterUrl: input.posterUrl,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: playbackProgress.id,
        set: {
          positionSeconds,
          durationSeconds:
            input.durationSeconds !== undefined
              ? Math.floor(input.durationSeconds)
              : existing?.durationSeconds,
          completed,
          ...(input.title ? { title: input.title } : {}),
          ...(input.posterUrl ? { posterUrl: input.posterUrl } : {}),
          updatedAt: now,
        },
      })
      .run();
  }

  listContinue(userId: string, limit = 20): Media[] {
    const rows = this.db
      .select()
      .from(playbackProgress)
      .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.completed, false)))
      .orderBy(desc(playbackProgress.updatedAt))
      .all()
      .filter((r) => r.provider === "dispatcharr" && (r.positionSeconds ?? 0) > 30)
      .slice(0, limit);

    return rows.map(rowToMedia);
  }

  /**
   * Suggest the next episode after recently completed IPTV episodes.
   * Identity-only until playback resolve finds the Dispatcharr uuid.
   */
  listNextUp(userId: string, limit = 12): Media[] {
    const rows = this.db
      .select()
      .from(playbackProgress)
      .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.completed, true)))
      .orderBy(desc(playbackProgress.updatedAt))
      .all()
      .filter(
        (r) =>
          r.provider === "dispatcharr" &&
          r.mediaType === "episode" &&
          r.tmdbId != null &&
          r.seasonNumber != null &&
          r.episodeNumber != null,
      )
      .slice(0, limit);

    const seenSeries = new Set<number>();
    const items: Media[] = [];
    for (const row of rows) {
      const tmdbId = row.tmdbId!;
      if (seenSeries.has(tmdbId)) continue;
      seenSeries.add(tmdbId);
      const seasonNumber = row.seasonNumber!;
      const episodeNumber = (row.episodeNumber ?? 0) + 1;
      const next = { seasonNumber, episodeNumber };
      const baseTitle = row.title?.replace(/\s*S\d+E\d+\s*$/i, "").trim();
      const availability = [
        {
          provider: "dispatcharr" as const,
          available: true,
          canPlay: true,
          candidates: [],
        },
      ];
      items.push({
        identity: {
          tmdbId,
          mediaType: "episode",
          seasonNumber: next.seasonNumber,
          episodeNumber: next.episodeNumber,
        },
        metadata: {
          title: baseTitle
            ? `${baseTitle} S${next.seasonNumber}E${next.episodeNumber}`
            : `S${next.seasonNumber}E${next.episodeNumber}`,
          posterUrl: row.posterUrl ?? undefined,
        },
        availability,
        preferredAction: resolvePreferredAction(availability),
      });
    }
    return items;
  }
}
