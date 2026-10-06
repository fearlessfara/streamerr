import { and, eq, lt, or, sql } from "drizzle-orm";
import { pickPreferredByCatalogueLanguage } from "@streamerr/shared";
import type { DispatcharrProvider } from "@streamerr/providers";
import type { AppDb } from "../db/client.js";
import { dispatcharrTmdbIndex } from "../db/schema.js";

export interface VodCatalogCandidate {
  dispatcharrId: number;
  uuid: string;
  name: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
}

export interface VodCatalogWinner {
  tmdbId: number;
  mediaType: "movie" | "tv";
  dispatcharrId: number;
  uuid: string;
  title: string;
  catalogueLanguage?: string;
}

/**
 * Group catalogue rows by TMDb id, rank language variants, keep one winner each.
 * Rows without a TMDb id must already have been filtered out by the caller.
 */
export function pickCatalogWinners(
  candidates: VodCatalogCandidate[],
  preferredLanguages: string[],
): VodCatalogWinner[] {
  const groups = new Map<string, VodCatalogCandidate[]>();
  for (const c of candidates) {
    const key = `${c.mediaType}:${c.tmdbId}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const winners: VodCatalogWinner[] = [];
  for (const group of groups.values()) {
    const best = pickPreferredByCatalogueLanguage(group, preferredLanguages, {
      nameOf: (item) => item.name,
      idOf: (item) => item.dispatcharrId,
    });
    if (!best) continue;
    winners.push({
      tmdbId: best.item.tmdbId,
      mediaType: best.item.mediaType,
      dispatcharrId: best.item.dispatcharrId,
      uuid: best.item.uuid,
      title: best.item.name,
      catalogueLanguage: best.catalogueLanguage,
    });
  }
  return winners;
}

export function applyCatalogWinners(
  db: AppDb,
  winners: VodCatalogWinner[],
  syncedAt: Date,
  opts?: { pruneStale?: boolean },
): { upserted: number; removed: number } {
  const now = syncedAt;
  for (const w of winners) {
    db.insert(dispatcharrTmdbIndex)
      .values({
        tmdbId: w.tmdbId,
        mediaType: w.mediaType,
        dispatcharrId: w.dispatcharrId,
        uuid: w.uuid,
        streamId: null,
        title: w.title,
        catalogueLanguage: w.catalogueLanguage ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dispatcharrTmdbIndex.tmdbId, dispatcharrTmdbIndex.mediaType],
        set: {
          dispatcharrId: w.dispatcharrId,
          uuid: w.uuid,
          title: w.title,
          catalogueLanguage: w.catalogueLanguage ?? null,
          updatedAt: now,
        },
      })
      .run();
  }

  // Only prune when the scan covered every page — a partial pass must not wipe the index.
  let removed = 0;
  if (opts?.pruneStale !== false) {
    removed = db
      .delete(dispatcharrTmdbIndex)
      .where(lt(dispatcharrTmdbIndex.updatedAt, now))
      .run().changes;
  }

  return { upserted: winners.length, removed };
}

const CATALOG_PAGE_CONCURRENCY = 4;
const CATALOG_PAGE_RETRIES = 3;

function pushPageItems(
  candidates: VodCatalogCandidate[],
  mediaType: "movie" | "tv",
  items: Array<{ id: number; uuid: string; name: string; tmdbId: number }>,
): void {
  for (const item of items) {
    candidates.push({
      dispatcharrId: item.id,
      uuid: item.uuid,
      name: item.name,
      tmdbId: item.tmdbId,
      mediaType,
    });
  }
}

async function fetchCatalogPage(
  dispatcharr: DispatcharrProvider,
  mediaType: "movie" | "tv",
  page: number,
): Promise<{
  items: Array<{ id: number; uuid: string; name: string; tmdbId: number }>;
  count: number;
  page: number;
  pageSize: number;
  rawCount: number;
} | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CATALOG_PAGE_RETRIES; attempt++) {
    try {
      return await dispatcharr.pageVodCatalogue(mediaType, { page, pageSize: 100 });
    } catch (err) {
      lastErr = err;
      const delayMs = attempt * 1_500;
      console.warn(
        `[vod-index] ${mediaType} page ${page} attempt ${attempt}/${CATALOG_PAGE_RETRIES} failed — retry in ${delayMs}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error(
    `[vod-index] ${mediaType} page ${page} skipped after retries`,
    lastErr instanceof Error ? lastErr.message : lastErr,
  );
  return null;
}

/**
 * Page the Dispatcharr catalogue. Metadata REST only (no IPTV streams).
 * Pages run with modest concurrency — sequential would take hours on 70k+ catalogs.
 * Individual page failures are skipped after retries so one timeout does not abort the scan.
 */
async function collectCatalogue(
  dispatcharr: DispatcharrProvider,
  mediaType: "movie" | "tv",
): Promise<{ candidates: VodCatalogCandidate[]; skipped: number }> {
  const candidates: VodCatalogCandidate[] = [];
  const first = await fetchCatalogPage(dispatcharr, mediaType, 1);
  if (!first) {
    throw new Error(`Dispatcharr ${mediaType} catalogue page 1 failed`);
  }
  pushPageItems(candidates, mediaType, first.items);
  if (first.rawCount === 0) return { candidates, skipped: 0 };

  const totalPages = Math.min(
    2000,
    Math.max(1, Math.ceil(first.count / first.pageSize)),
  );
  console.info(`[vod-index] ${mediaType}: scanning ${totalPages} page(s)`);

  let nextPage = 2;
  let completed = 1;
  let skipped = 0;

  const worker = async () => {
    while (true) {
      const page = nextPage;
      nextPage += 1;
      if (page > totalPages) return;
      const result = await fetchCatalogPage(dispatcharr, mediaType, page);
      if (!result) {
        skipped += 1;
        completed += 1;
        continue;
      }
      if (result.rawCount === 0) {
        nextPage = totalPages + 1;
        return;
      }
      pushPageItems(candidates, mediaType, result.items);
      completed += 1;
      if (completed % 50 === 0 || completed >= totalPages) {
        console.info(
          `[vod-index] ${mediaType}: ${Math.min(completed, totalPages)}/${totalPages} pages (skipped=${skipped})`,
        );
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CATALOG_PAGE_CONCURRENCY, Math.max(1, totalPages - 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  if (skipped > 0) {
    console.warn(`[vod-index] ${mediaType}: finished with ${skipped} skipped page(s)`);
  }
  return { candidates, skipped };
}

export interface VodCatalogSyncResult {
  movies: number;
  series: number;
  upserted: number;
  removed: number;
}

export async function syncVodCatalog(opts: {
  db: AppDb;
  dispatcharr: DispatcharrProvider;
  preferredLanguages: string[];
}): Promise<VodCatalogSyncResult> {
  const movies = await collectCatalogue(opts.dispatcharr, "movie");
  const series = await collectCatalogue(opts.dispatcharr, "tv");
  const winners = pickCatalogWinners(
    [...movies.candidates, ...series.candidates],
    opts.preferredLanguages,
  );
  const syncedAt = new Date();
  const complete = movies.skipped === 0 && series.skipped === 0;
  const { upserted, removed } = applyCatalogWinners(opts.db, winners, syncedAt, {
    pruneStale: complete,
  });
  if (!complete) {
    console.warn(
      `[vod-index] partial sync — upserted without pruning (movieGaps=${movies.skipped} seriesGaps=${series.skipped})`,
    );
  }
  return {
    movies: movies.candidates.length,
    series: series.candidates.length,
    upserted,
    removed,
  };
}

export function startVodCatalogSync(opts: {
  db: AppDb;
  dispatcharr: DispatcharrProvider;
  preferredLanguages: string[];
  intervalMs: number;
  enabled: boolean;
}): { stop: () => void } {
  if (!opts.enabled || opts.intervalMs <= 0) {
    return { stop: () => undefined };
  }

  let running = false;
  let stopped = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await syncVodCatalog(opts);
      console.info(
        `[vod-index] synced movies=${result.movies} series=${result.series} upserted=${result.upserted} removed=${result.removed}`,
      );
    } catch (err) {
      console.error("[vod-index] sync failed — previous index kept", err);
    } finally {
      running = false;
    }
  };

  // First pass shortly after startup so home rails can enrich without waiting a full interval.
  const bootTimer = setTimeout(() => {
    void run();
  }, 5_000);
  bootTimer.unref?.();

  const interval = setInterval(() => {
    void run();
  }, opts.intervalMs);
  interval.unref?.();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(bootTimer);
      clearInterval(interval);
    },
  };
}

/** True when every (tmdbId, mediaType) pair is present in the index. */
export function indexedTmdbKeys(
  db: AppDb,
  keys: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>,
): Set<string> {
  const out = new Set<string>();
  if (!keys.length) return out;

  // SQLite handles moderate IN lists well; chunk to stay under parameter limits.
  const CHUNK = 200;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const clauses = chunk.map(
      (k) =>
        and(
          eq(dispatcharrTmdbIndex.tmdbId, k.tmdbId),
          eq(dispatcharrTmdbIndex.mediaType, k.mediaType),
        ),
    );
    const rows = db
      .select({
        tmdbId: dispatcharrTmdbIndex.tmdbId,
        mediaType: dispatcharrTmdbIndex.mediaType,
      })
      .from(dispatcharrTmdbIndex)
      .where(or(...clauses))
      .all();
    for (const row of rows) {
      out.add(`${row.mediaType}:${row.tmdbId}`);
    }
  }
  return out;
}

/** Count of indexed VOD titles (for health / diagnostics). */
export function vodIndexCount(db: AppDb): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(dispatcharrTmdbIndex)
    .all()[0];
  return Number(row?.n ?? 0);
}
