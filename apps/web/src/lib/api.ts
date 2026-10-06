import type {
  EpisodeListItem,
  EpgProgramme,
  LiveChannel,
  LiveChannelGroup,
  LiveNowNext,
  Media,
  MediaIdentity,
  PlaybackResolveResult,
  PlaybackSource,
  SubtitleTrack,
} from "@streamerr/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function login(input: {
  username: string;
  password: string;
  deviceId: string;
  deviceName: string;
}) {
  return request<{ user: { id: string; username: string } }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  return request<{ user: { id: string; username: string }; mocks: boolean }>("/api/auth/me");
}

export function health() {
  return request<{ status: string; service: string }>("/api/health");
}

export function healthProviders() {
  return request<{
    status: string;
    mocks: boolean;
    providers: Array<{ id: string; status: string; message?: string }>;
  }>("/api/health/providers");
}

export function home() {
  return request<{
    rows: Array<{ id: string; title: string; items: Media[] }>;
  }>("/api/home");
}

export function mediaByJellyfin(itemId: string) {
  return request<{ media: Media }>(`/api/media/jellyfin/${encodeURIComponent(itemId)}`);
}

export function mediaByTmdb(type: "movie" | "tv", tmdbId: number) {
  return request<{ media: Media }>(`/api/media/${type}/${tmdbId}`);
}

export function seriesEpisodes(tmdbId: number) {
  return request<{
    series: Media;
    seasons: number[];
    items: EpisodeListItem[];
  }>(`/api/media/tv/${tmdbId}/episodes`);
}

export function discoverMovies(page = 1, opts?: { genreId?: number }) {
  const qs = new URLSearchParams({ page: String(page) });
  if (opts?.genreId != null) qs.set("genreId", String(opts.genreId));
  return request<{ items: Media[] }>(`/api/discover/movies?${qs}`);
}

export function discoverTv(page = 1, opts?: { genreId?: number }) {
  const qs = new URLSearchParams({ page: String(page) });
  if (opts?.genreId != null) qs.set("genreId", String(opts.genreId));
  return request<{ items: Media[] }>(`/api/discover/tv?${qs}`);
}

export function catalogRails(mediaType: "movie" | "tv", opts?: { search?: string }) {
  const qs = new URLSearchParams();
  if (opts?.search) qs.set("search", opts.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ rows: Array<{ id: string; title: string; items: Media[] }> }>(
    `/api/catalog/${mediaType}${suffix}`,
  );
}

export function searchMedia(q: string, page = 1) {
  return request<{ items: Media[]; query: string }>(
    `/api/search?q=${encodeURIComponent(q)}&page=${page}`,
  );
}

export function requestMedia(identity: MediaIdentity) {
  return request<{ ok: true; media: Media | null }>("/api/request", {
    method: "POST",
    body: JSON.stringify({ identity }),
  });
}

export function startAcquisition(input: {
  identity: MediaIdentity;
  mode?: "cache" | "library";
  source: {
    provider: "dispatcharr";
    movieId?: number;
    episodeId?: number;
    uuid: string;
    streamId?: string;
    m3uAccountId?: number;
  };
}) {
  return request<{ item: import("@streamerr/shared").Acquisition }>("/api/acquisitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAcquisition(id: string) {
  return request<{ item: import("@streamerr/shared").Acquisition }>(
    `/api/acquisitions/${encodeURIComponent(id)}`,
  );
}

export function cancelAcquisition(id: string) {
  return request<{ item: import("@streamerr/shared").Acquisition }>(
    `/api/acquisitions/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
}

export function promoteAcquisition(id: string) {
  return request<{ item: import("@streamerr/shared").Acquisition }>(
    `/api/acquisitions/${encodeURIComponent(id)}/promote`,
    { method: "POST" },
  );
}

export function listAcquisitions() {
  return request<{ items: import("@streamerr/shared").Acquisition[] }>("/api/acquisitions");
}

export function libraryItems(
  mediaType: "movie" | "tv",
  opts?: { startIndex?: number; limit?: number; search?: string },
) {
  const qs = new URLSearchParams();
  if (opts?.startIndex != null) qs.set("startIndex", String(opts.startIndex));
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.search) qs.set("search", opts.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: Media[]; total: number }>(
    `/api/library/${mediaType}${suffix}`,
  );
}

export function listRequests(opts?: {
  take?: number;
  skip?: number;
  filter?: string;
  mediaType?: "movie" | "tv" | "all";
}) {
  const qs = new URLSearchParams();
  if (opts?.take != null) qs.set("take", String(opts.take));
  if (opts?.skip != null) qs.set("skip", String(opts.skip));
  if (opts?.filter) qs.set("filter", opts.filter);
  if (opts?.mediaType) qs.set("mediaType", opts.mediaType);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{
    items: Array<{
      id: number;
      mediaType: "movie" | "tv";
      tmdbId?: number;
      title: string;
      year?: number;
      posterUrl?: string;
      status: string;
      mediaStatus?: string;
      createdAt?: string;
      is4k?: boolean;
    }>;
    total: number;
  }>(`/api/requests${suffix}`);
}

export function resolvePlayback(
  identity: MediaIdentity,
  opts?: {
    startPositionSeconds?: number;
    audioStreamIndex?: number;
    maxStreamingBitrate?: number;
  },
) {
  return request<PlaybackResolveResult>("/api/playback/resolve", {
    method: "POST",
    body: JSON.stringify({
      identity,
      startPositionSeconds: opts?.startPositionSeconds,
      audioStreamIndex: opts?.audioStreamIndex,
      maxStreamingBitrate: opts?.maxStreamingBitrate,
    }),
  });
}

const PLAY_BUFFER_POLL_MS = 500;
const PLAY_BUFFER_TIMEOUT_MS = 60_000;
const BW_PROBE_BYTES = 1_500_000;
const BW_PROBE_CACHE_KEY = "streamerr.bwProbe";
const BW_PROBE_TTL_MS = 5 * 60_000;
const BW_PROBE_HEADROOM = 0.65;
const BW_MIN = 2_000_000;
const BW_MAX = 20_000_000;

function clampBitrate(bps: number): number {
  if (!Number.isFinite(bps) || bps <= 0) return 8_000_000;
  return Math.min(BW_MAX, Math.max(BW_MIN, Math.floor(bps)));
}

/**
 * Measure browser→nginx→Jellyfin throughput via a Range probe (same hop as HLS).
 * Cached in sessionStorage so Play is not delayed on every title.
 */
export async function measurePlaybackBitrate(itemId?: string): Promise<number | undefined> {
  try {
    const cached = sessionStorage.getItem(BW_PROBE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { bps?: number; at?: number };
      if (
        parsed.bps &&
        parsed.at &&
        Date.now() - parsed.at < BW_PROBE_TTL_MS &&
        parsed.bps >= BW_MIN
      ) {
        return parsed.bps;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const qs = itemId ? `?itemId=${encodeURIComponent(itemId)}` : "";
    const t0 = performance.now();
    const res = await fetch(`/api/playback/bandwidth-probe${qs}`, {
      credentials: "include",
      headers: {
        Range: `bytes=0-${BW_PROBE_BYTES - 1}`,
        Accept: "application/octet-stream",
      },
    });
    if (!res.ok && res.status !== 206) return undefined;
    const buf = await res.arrayBuffer();
    const seconds = Math.max((performance.now() - t0) / 1000, 0.001);
    if (buf.byteLength < 32_000) return undefined;
    const bps = clampBitrate(((buf.byteLength * 8) / seconds) * BW_PROBE_HEADROOM);
    try {
      sessionStorage.setItem(
        BW_PROBE_CACHE_KEY,
        JSON.stringify({ bps, at: Date.now() }),
      );
    } catch {
      /* ignore quota */
    }
    return bps;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a playable source. IPTV Play auto-starts a cache download and may
 * buffer until enough bytes exist for local remux (max IPTV connections = 1).
 *
 * While buffering, poll `/api/acquisitions/:id` only — do not re-POST resolve
 * (that re-runs Jellyfin/cache/IPTV pick every tick). One final resolve when
 * the acquisition becomes playable.
 */
export async function resolvePlaybackForPlay(
  identity: MediaIdentity,
  opts?: {
    meta?: { durationSeconds?: number; runtimeMinutes?: number } | null;
    onBuffering?: (info: { acquisitionId: string; bytesDownloaded?: number; totalBytes?: number }) => void;
  },
): Promise<PlaybackSource> {
  const started = Date.now();
  const maxStreamingBitrate = await measurePlaybackBitrate(identity.jellyfinItemId);

  const first = await resolvePlayback(identity, { maxStreamingBitrate });
  if (first.status === "ready") {
    return withCatalogueDuration(first.source, opts?.meta);
  }

  const acquisitionId = first.acquisitionId;

  while (Date.now() - started < PLAY_BUFFER_TIMEOUT_MS) {
    const { item } = await getAcquisition(acquisitionId);
    if (item.state === "failed" || item.state === "cancelled") {
      throw new Error(
        item.state === "cancelled"
          ? "Download was cancelled"
          : "Download failed — IPTV may be busy (stop Live TV and retry)",
      );
    }
    opts?.onBuffering?.({
      acquisitionId: item.id,
      bytesDownloaded: item.bytesDownloaded,
      totalBytes: item.totalBytes,
    });
    if (item.playbackAvailable) {
      const ready = await resolvePlayback(identity, { maxStreamingBitrate });
      if (ready.status === "ready") {
        return withCatalogueDuration(ready.source, opts?.meta);
      }
      // Acquisition claimed playable but resolve disagreed — brief wait + retry.
    }
    await new Promise((r) => setTimeout(r, PLAY_BUFFER_POLL_MS));
  }

  throw new Error("Timed out waiting for download to become playable");
}

/** Fetch subtitle tracks for a title (async enrichment after Play resolves). */
export function listPlaybackSubtitles(
  identity: MediaIdentity,
  opts?: {
    existing?: SubtitleTrack[];
    provider?: PlaybackSource["provider"];
    signal?: AbortSignal;
  },
) {
  return request<{ subtitles: SubtitleTrack[] }>("/api/playback/subtitles", {
    method: "POST",
    body: JSON.stringify({
      identity,
      existing: opts?.existing,
      provider: opts?.provider,
    }),
    signal: opts?.signal,
  }).then((r) => r.subtitles);
}

/** Fill missing PlaybackSource.durationSeconds from catalogue metadata. */
export function withCatalogueDuration(
  source: PlaybackSource,
  meta?: { durationSeconds?: number; runtimeMinutes?: number } | null,
): PlaybackSource {
  if (source.durationSeconds != null && source.durationSeconds > 0) return source;
  const fromMeta =
    meta?.durationSeconds != null && meta.durationSeconds > 0
      ? meta.durationSeconds
      : meta?.runtimeMinutes != null && meta.runtimeMinutes > 0
        ? meta.runtimeMinutes * 60
        : undefined;
  if (fromMeta == null) return source;
  return { ...source, durationSeconds: fromMeta };
}

/** Human label for cache TTL remaining (e.g. "6 days left"). */
export function formatCacheTtlRemaining(cacheExpiresAt?: string | null): string | null {
  if (!cacheExpiresAt) return null;
  const ms = Date.parse(cacheExpiresAt) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "expires soon";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days} days left`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours >= 2) return `${hours} hours left`;
  return "under an hour left";
}

export function reportProgress(body: {
  itemId: string;
  positionSeconds: number;
  event: "start" | "progress" | "stopped";
  playSessionId?: string;
  mediaSourceId?: string;
  isPaused?: boolean;
}) {
  return request<{ ok: boolean }>("/api/playback/progress", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reportIptvProgress(body: {
  identity: MediaIdentity;
  positionSeconds: number;
  durationSeconds?: number;
  event?: "start" | "progress" | "stopped";
  title?: string;
}) {
  return request<{ ok: boolean }>("/api/playback/iptv-progress", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function liveGroups() {
  return request<{ items: LiveChannelGroup[] }>("/api/live/groups");
}

export function liveChannels(opts?: {
  groupId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  favouritesOnly?: boolean;
}) {
  const qs = new URLSearchParams();
  if (opts?.groupId) qs.set("groupId", opts.groupId);
  if (opts?.search) qs.set("search", opts.search);
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.pageSize) qs.set("pageSize", String(opts.pageSize));
  if (opts?.favouritesOnly) qs.set("favouritesOnly", "1");
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: LiveChannel[]; total: number; favourites: string[] }>(
    `/api/live/channels${suffix}`,
  );
}

export function liveNow(channelUuids: string[]) {
  return request<{ items: LiveNowNext[] }>("/api/live/now", {
    method: "POST",
    body: JSON.stringify({ channelUuids }),
  });
}

export function liveGuide(opts?: { start?: string; end?: string }) {
  const qs = new URLSearchParams();
  if (opts?.start) qs.set("start", opts.start);
  if (opts?.end) qs.set("end", opts.end);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: EpgProgramme[]; start: string; end: string }>(
    `/api/live/guide${suffix}`,
  );
}

export function toggleLiveFavourite(uuid: string) {
  return request<{ favourites: string[]; favourite: boolean }>(
    `/api/live/favourites/${encodeURIComponent(uuid)}/toggle`,
    { method: "POST" },
  );
}

export function playLiveChannel(uuid: string) {
  return request<{ source: PlaybackSource; title?: string; channel?: LiveChannel }>(
    `/api/live/play/${encodeURIComponent(uuid)}`,
    { method: "POST" },
  );
}
