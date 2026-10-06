import {
  BazarrProvider,
  DispatcharrProvider,
  JellyfinProvider,
  MockDispatcharrProvider,
  MockJellyfinProvider,
  MockSeerrProvider,
  SeerrProvider,
  type MediaProvider,
} from "@streamerr/providers";
import type { AppConfig } from "./config.js";
import { MemoryCache } from "./cache.js";
import { createDb, type AppDb } from "./db/client.js";
import { SessionService } from "./services/session.js";
import { PlaybackResolver } from "./services/playback-resolver.js";
import { AcquisitionManager } from "./services/acquisition-manager.js";
import { LiveFavouritesStore } from "./services/live-favourites.js";
import { CacheManager } from "./services/cache-manager.js";
import { IptvConnectionManager } from "./services/iptv-connection-manager.js";
import { IptvProgressStore } from "./services/iptv-progress.js";
import { startVodCatalogSync } from "./services/vod-catalog-sync.js";

export interface AppContext {
  config: AppConfig;
  db: AppDb;
  cache: MemoryCache;
  sessions: SessionService;
  jellyfin: JellyfinProvider | MockJellyfinProvider;
  seerr: SeerrProvider | MockSeerrProvider;
  dispatcharr: DispatcharrProvider | MockDispatcharrProvider;
  bazarr: BazarrProvider;
  providers: MediaProvider[];
  playbackResolver: PlaybackResolver;
  acquisitions: AcquisitionManager;
  liveFavourites: LiveFavouritesStore;
  cacheManager: CacheManager;
  iptvConnections: IptvConnectionManager;
  /** Last authenticated Jellyfin user context used for background library scans. */
  lastLibraryUserContext?: import("@streamerr/providers").UserContext;
  useMocks: boolean;
}

export function createAppContext(config: AppConfig): AppContext {
  if (config.FFMPEG_PATH) process.env.FFMPEG_PATH = config.FFMPEG_PATH;
  const explicitMocks = Boolean(config.STREAMERR_USE_MOCKS);
  const missingJellyfin = !config.JELLYFIN_URL?.trim();
  // Never treat a missing Jellyfin URL as mocks when other backends are configured —
  // that would accept any password while still driving Seerr/Dispatcharr.
  if (
    missingJellyfin &&
    !explicitMocks &&
    (config.SEERR_URL?.trim() || config.DISPATCHARR_URL?.trim())
  ) {
    throw new Error(
      "JELLYFIN_URL is required unless STREAMERR_USE_MOCKS=true (Seerr/Dispatcharr are configured)",
    );
  }
  if (config.NODE_ENV === "production" && missingJellyfin && !explicitMocks) {
    throw new Error("JELLYFIN_URL is required in production (or set STREAMERR_USE_MOCKS=true)");
  }
  const useMocks = explicitMocks || missingJellyfin;
  const db = createDb(config.STREAMERR_DATA_DIR);
  const cache = new MemoryCache();
  const sessions = new SessionService(db);
  void sessions.purgeExpired();
  const purgeTimer = setInterval(() => {
    void sessions.purgeExpired().catch((err) => {
      console.error("[sessions] purge failed", err);
    });
  }, 60 * 60_000);
  purgeTimer.unref?.();

  const jellyfin = useMocks
    ? new MockJellyfinProvider()
    : new JellyfinProvider({
        baseUrl: config.JELLYFIN_URL,
        timeoutMs: config.HTTP_TIMEOUT_MS,
        streamerrPublicUrl: config.STREAMERR_PUBLIC_URL,
      });

  const seerr = useMocks
    ? new MockSeerrProvider()
    : new SeerrProvider({
        baseUrl: config.SEERR_URL,
        apiKey: config.SEERR_API_KEY,
        timeoutMs: config.HTTP_TIMEOUT_MS,
      });

  const dispatcharr = useMocks
    ? new MockDispatcharrProvider()
    : new DispatcharrProvider({
        baseUrl: config.DISPATCHARR_URL,
        auth: config.dispatcharrAuth,
        timeoutMs: config.HTTP_TIMEOUT_MS,
        streamerrPublicUrl: config.STREAMERR_PUBLIC_URL,
        cloudflareAccess: config.dispatcharrCloudflareAccess,
        preferredLanguages: config.STREAMERR_PREFERRED_LANGUAGES,
      });

  const bazarr = new BazarrProvider({
    baseUrl: config.BAZARR_URL,
    apiKey: config.BAZARR_API_KEY,
    timeoutMs: config.HTTP_TIMEOUT_MS,
  });

  const providers: MediaProvider[] = [jellyfin, seerr, dispatcharr, bazarr];
  const liveFavourites = new LiveFavouritesStore(db);
  const cacheManager = new CacheManager(db, {
    maxBytes: config.STREAMERR_CACHE_MAX_BYTES,
    ttlMs: config.STREAMERR_CACHE_TTL_MS,
    // Protect recently played cache files for long watches (default was 5 minutes).
    protectMs: 3 * 60 * 60_000,
    dataDir: config.STREAMERR_DATA_DIR,
  });
  const iptvConnections = new IptvConnectionManager(config.STREAMERR_IPTV_MAX_CONNECTIONS);
  const acquisitions = new AcquisitionManager(
    config.STREAMERR_DATA_DIR,
    dispatcharr,
    db,
    {
      iptvConnections,
      cacheManager,
      cacheTtlMs: config.STREAMERR_CACHE_TTL_MS,
    },
  );
  const iptvProgress = new IptvProgressStore(db);
  const playbackResolver = new PlaybackResolver(
    jellyfin,
    dispatcharr,
    seerr,
    acquisitions,
    db,
    bazarr,
    iptvProgress,
  );

  const ctx: AppContext = {
    config,
    db,
    cache,
    sessions,
    jellyfin,
    seerr,
    dispatcharr,
    bazarr,
    providers,
    playbackResolver,
    acquisitions,
    liveFavourites,
    cacheManager,
    iptvConnections,
    useMocks,
  };

  // Periodic cache eviction
  const evictTimer = setInterval(() => {
    try {
      const n = cacheManager.evict();
      if (n > 0) console.info(`[cache] evicted ${n} acquisition(s)`);
    } catch (err) {
      console.error("[cache] eviction failed", err);
    }
  }, 15 * 60_000);
  evictTimer.unref?.();
  cacheManager.evict();

  acquisitions.setLibraryPromotedHandler(async (localPath) => {
    const userContext = ctx.lastLibraryUserContext;
    if (!userContext) return;
    try {
      await jellyfin.notifyLibraryPathsUpdated(userContext, [localPath]);
    } catch {
      // Path notify can fail if Jellyfin hasn't indexed the folder yet — fall back to scan.
    }
    try {
      await jellyfin.refreshLibrary(userContext);
    } catch (err) {
      console.error("[jellyfin] library refresh after promote failed", err);
    }
  });

  acquisitions.setLibraryMetaResolver(async (identity) => {
    const tmdbId = identity.tmdbId;
    if (!tmdbId || !seerr.getDetails) return undefined;
    const kind =
      identity.mediaType === "episode" || identity.mediaType === "tv" ? "tv" : "movie";
    const media = await seerr.getDetails(kind, tmdbId).catch(() => null);
    if (!media) return undefined;
    return {
      title: media.metadata.title,
      year: media.metadata.year,
      seriesTitle: kind === "tv" ? media.metadata.title : undefined,
      seasonNumber: identity.seasonNumber,
      episodeNumber: identity.episodeNumber,
    };
  });

  // Background Dispatcharr VOD catalogue index (metadata only — no IPTV streams).
  startVodCatalogSync({
    db,
    dispatcharr: dispatcharr as DispatcharrProvider,
    preferredLanguages: config.STREAMERR_PREFERRED_LANGUAGES,
    intervalMs: config.STREAMERR_VOD_SYNC_INTERVAL_MS,
    enabled:
      !useMocks &&
      Boolean(config.DISPATCHARR_URL?.trim()) &&
      dispatcharr instanceof DispatcharrProvider,
  });

  return ctx;
}
