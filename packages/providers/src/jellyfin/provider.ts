import type { Media, MediaIdentity, MediaType, PlaybackSource, ProviderHealth } from "@streamerr/shared";
import { ProviderError } from "@streamerr/shared";
import { HttpClient, mediaBrowserAuth } from "../http.js";
import type { LibraryProvider, PlaybackProvider, UserContext } from "../types.js";
import { JELLYFIN_CAPABILITIES } from "../types.js";
import { extractTmdbId, hasPlayableMedia, itemMatchesTmdb, ticksToSeconds } from "./identity.js";
import { mapJellyfinItemToMedia } from "./map-item.js";
import {
  JellyfinAuthResultSchema,
  JellyfinItemSchema,
  JellyfinItemsResponseSchema,
  JellyfinPlaybackInfoSchema,
  JellyfinSystemInfoSchema,
  type JellyfinItem,
} from "./schemas.js";

export interface JellyfinProviderOptions {
  baseUrl: string;
  timeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  fetchImpl?: typeof fetch;
  /** Public base used when building Streamerr proxy URLs for playback */
  streamerrPublicUrl?: string;
}

export class JellyfinProvider implements LibraryProvider, PlaybackProvider {
  readonly id = "jellyfin";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly streamerrPublicUrl?: string;

  constructor(opts: JellyfinProviderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.clientName = opts.clientName ?? "Streamerr";
    this.clientVersion = opts.clientVersion ?? "0.1.0";
    this.fetchImpl = opts.fetchImpl;
    this.streamerrPublicUrl = opts.streamerrPublicUrl;
  }

  capabilities() {
    return JELLYFIN_CAPABILITIES;
  }

  private httpFor(ctx?: UserContext, deviceId = "streamerr-health"): HttpClient {
    const token = ctx?.jellyfinAccessToken;
    return new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      serviceName: "jellyfin",
      fetchImpl: this.fetchImpl,
      defaultHeaders: {
        Authorization: mediaBrowserAuth({
          client: this.clientName,
          device: ctx?.deviceName ?? "Streamerr",
          deviceId: ctx?.deviceId ?? deviceId,
          version: this.clientVersion,
          token,
        }),
      },
    });
  }

  async authenticate(input: {
    username: string;
    password: string;
    deviceId: string;
    deviceName: string;
  }) {
    const http = new HttpClient({
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      serviceName: "jellyfin",
      fetchImpl: this.fetchImpl,
      defaultHeaders: {
        Authorization: mediaBrowserAuth({
          client: this.clientName,
          device: input.deviceName,
          deviceId: input.deviceId,
          version: this.clientVersion,
        }),
      },
    });

    const { data } = await http.request("POST", "/Users/AuthenticateByName", {
      body: { Username: input.username, Pw: input.password },
      schema: JellyfinAuthResultSchema,
    });

    return {
      userId: data.User.Id,
      username: data.User.Name,
      accessToken: data.AccessToken,
      serverId: data.ServerId,
    };
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const { data } = await this.httpFor().request("GET", "/System/Info/Public", {
        schema: JellyfinSystemInfoSchema,
        allowStatuses: [200],
      });
      return {
        id: this.id,
        status: "ok",
        latencyMs: Date.now() - started,
        message: data.ServerName ? `Jellyfin ${data.Version ?? ""}`.trim() : undefined,
        capabilities: this.capabilities(),
      };
    } catch (err) {
      // Public info may require auth on some installs — try System/Info without token as degraded probe
      try {
        await this.httpFor().request("GET", "/System/Info", {
          schema: JellyfinSystemInfoSchema,
        });
        return {
          id: this.id,
          status: "ok",
          latencyMs: Date.now() - started,
          capabilities: this.capabilities(),
        };
      } catch {
        return {
          id: this.id,
          status: "down",
          latencyMs: Date.now() - started,
          message: err instanceof Error ? err.message : String(err),
          capabilities: this.capabilities(),
        };
      }
    }
  }

  async getContinueWatching(userContext: UserContext): Promise<Media[]> {
    const { data } = await this.httpFor(userContext).request("GET", "/UserItems/Resume", {
      query: {
        userId: userContext.jellyfinUserId,
        Limit: 24,
        Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
      },
      schema: JellyfinItemsResponseSchema,
    });
    return (data.Items ?? []).map((item) => this.toMedia(item));
  }

  async getNextUp(userContext: UserContext): Promise<Media[]> {
    const { data } = await this.httpFor(userContext).request("GET", "/Shows/NextUp", {
      query: {
        userId: userContext.jellyfinUserId,
        Limit: 24,
        Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
      },
      schema: JellyfinItemsResponseSchema,
    });
    return (data.Items ?? []).map((item) => this.toMedia(item));
  }

  async getRecentlyAdded(userContext: UserContext): Promise<Media[]> {
    const { data } = await this.httpFor(userContext).request<unknown>("GET", "/Items/Latest", {
      query: {
        userId: userContext.jellyfinUserId,
        Limit: 24,
        Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
      },
    });
    const items = parseLatestItems(data);
    return items.map((item) => this.toMedia(item));
  }

  async getByJellyfinItemId(userContext: UserContext, itemId: string): Promise<Media | null> {
    try {
      const { data } = await this.httpFor(userContext).request(
        "GET",
        `/Items/${encodeURIComponent(itemId)}`,
        {
          query: {
            userId: userContext.jellyfinUserId,
            Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
          },
          schema: JellyfinItemSchema,
        },
      );
      return this.toMedia(data);
    } catch (err) {
      if (err instanceof ProviderError && err.code === "not_found") return null;
      throw err;
    }
  }

  async findByTmdb(
    userContext: UserContext,
    tmdbId: number,
    mediaType: MediaType,
  ): Promise<Media | null> {
    const include =
      mediaType === "movie" ? "Movie" : mediaType === "tv" ? "Series" : "Movie,Series,Episode";
    const { data } = await this.httpFor(userContext).request("GET", "/Items", {
      query: {
        Recursive: true,
        userId: userContext.jellyfinUserId,
        AnyProviderIdEquals: `Tmdb.${tmdbId}`,
        IncludeItemTypes: include,
        Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
      },
      schema: JellyfinItemsResponseSchema,
    });

    const matched = (data.Items ?? []).filter(
      (item) => itemMatchesTmdb(item, tmdbId) && hasPlayableMedia(item),
    );
    const item = matched[0];
    if (!item) {
      void extractTmdbId;
      return null;
    }
    return this.toMedia(item);
  }

  async listLibrary(
    userContext: UserContext,
    opts: {
      mediaType: "movie" | "tv";
      startIndex?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
    },
  ): Promise<{ items: Media[]; total: number }> {
    const include = opts.mediaType === "movie" ? "Movie" : "Series";
    const { data } = await this.httpFor(userContext).request("GET", "/Items", {
      query: {
        Recursive: true,
        userId: userContext.jellyfinUserId,
        IncludeItemTypes: include,
        StartIndex: opts.startIndex ?? 0,
        Limit: opts.limit ?? 48,
        SortBy: opts.sortBy ?? "SortName",
        SortOrder: "Ascending",
        SearchTerm: opts.search?.trim() || undefined,
        Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
      },
      schema: JellyfinItemsResponseSchema,
    });
    return {
      items: (data.Items ?? []).map((item) => this.toMedia(item)),
      total: data.TotalRecordCount ?? data.Items?.length ?? 0,
    };
  }

  async listEpisodesForSeries(userContext: UserContext, seriesItemId: string): Promise<Media[]> {
    if (!seriesItemId) return [];
    const { data } = await this.httpFor(userContext).request(
      "GET",
      `/Shows/${encodeURIComponent(seriesItemId)}/Episodes`,
      {
        query: {
          userId: userContext.jellyfinUserId,
          Fields: "ProviderIds,Path,MediaSources,Overview,UserData",
        },
        schema: JellyfinItemsResponseSchema,
      },
    );
    return (data.Items ?? []).map((item) => {
      const media = this.toMedia(item);
      // Prefer raw episode name in season lists (mapJellyfinItem uses Series SxEx).
      const name = item.Name?.trim();
      if (name) {
        return { ...media, metadata: { ...media.metadata, title: name } };
      }
      return media;
    });
  }

  private toMedia(item: JellyfinItem): Media {
    return mapJellyfinItemToMedia(item, {
      jellyfinBaseUrl: this.baseUrl,
      imageProxyBase: this.streamerrPublicUrl,
    });
  }

  async openImage(userContext: UserContext, itemId: string, imageType: string): Promise<Response> {
    const url = `${this.baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(imageType)}`;
    const res = await (this.fetchImpl ?? fetch)(url, {
      headers: {
        Authorization: mediaBrowserAuth({
          client: this.clientName,
          device: userContext.deviceName,
          deviceId: userContext.deviceId,
          version: this.clientVersion,
          token: userContext.jellyfinAccessToken,
        }),
      },
    });
    if (!res.ok) {
      throw new ProviderError(`Jellyfin image failed: ${res.status}`, {
        code: classifyOrUnknown(res.status),
        provider: "jellyfin",
        statusCode: res.status,
      });
    }
    return res;
  }

  async resolvePlayback(
    userContext: UserContext,
    identity: MediaIdentity,
  ): Promise<PlaybackSource | null> {
    const itemId = identity.jellyfinItemId;
    if (!itemId) return null;

    const { data } = await this.httpFor(userContext).request(
      "POST",
      `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
      {
        query: { userId: userContext.jellyfinUserId },
        body: {
          UserId: userContext.jellyfinUserId,
          DeviceProfile: browserDeviceProfile(),
          EnableDirectPlay: true,
          EnableDirectStream: true,
          EnableTranscoding: true,
          MaxStreamingBitrate: 120_000_000,
        },
        schema: JellyfinPlaybackInfoSchema,
      },
    );

    const source = data.MediaSources?.[0];
    if (!source) return null;

    const playSessionId = data.PlaySessionId;
    const playMethod = resolvePlayMethodForBrowser(source);
    const isHls =
      playMethod === "Transcode" ||
      source.TranscodingSubProtocol === "hls" ||
      Boolean(source.TranscodingUrl?.includes(".m3u8"));

    const params = new URLSearchParams({
      mediaSourceId: source.Id,
      playMethod,
    });
    if (playSessionId) params.set("playSessionId", playSessionId);
    if (source.DefaultAudioStreamIndex != null) {
      params.set("audioStreamIndex", String(source.DefaultAudioStreamIndex));
    }
    if (source.TranscodingUrl) {
      const relative = normalizeJellyfinRelativePath(source.TranscodingUrl, this.baseUrl);
      if (relative) params.set("transcodingPath", relative);
    }

    // Same-origin Streamerr proxy keeps Jellyfin tokens server-side (session cookie only).
    // Browser never sees Jellyfin credentials; DirectPlay/DirectStream/Transcode still run on Jellyfin.
    const proxyUrl = `/api/playback/jellyfin/stream/${encodeURIComponent(itemId)}?${params.toString()}`;

    const item = await this.getByJellyfinItemId(userContext, itemId);
    const startPositionSeconds =
      item?.availability.find((a) => a.provider === "jellyfin")?.positionSeconds ?? 0;

    const audioTracks = (source.MediaStreams ?? [])
      .filter((s) => s.Type === "Audio")
      .map((s) => ({
        index: s.Index ?? 0,
        language: s.Language ?? undefined,
        label: s.DisplayTitle ?? s.Codec ?? undefined,
      }));

    const subtitles = (source.MediaStreams ?? [])
      .filter((s) => s.Type === "Subtitle" && isBrowserTextSubtitle(s))
      .map((s) => {
        const index = s.Index ?? 0;
        return {
          index,
          language: s.Language ?? undefined,
          label: subtitleLabelFromStream(s, index),
          forced: Boolean(s.IsForced),
          hearingImpaired: Boolean(s.IsHearingImpaired),
          url: `/api/playback/jellyfin/subtitle/${encodeURIComponent(itemId)}/${index}?mediaSourceId=${encodeURIComponent(source.Id)}`,
        };
      });

    return {
      provider: "jellyfin",
      delivery: { mode: "proxy", url: proxyUrl },
      directPlay: playMethod === "DirectPlay",
      playMethod,
      hls: isHls,
      mimeType: isHls
        ? "application/vnd.apple.mpegurl"
        : source.Container
          ? `video/${source.Container}`
          : undefined,
      playSessionId,
      mediaSourceId: source.Id,
      itemId,
      startPositionSeconds,
      audioTracks,
      subtitles,
    };
  }

  async reportProgress(
    userContext: UserContext,
    input: {
      itemId: string;
      positionSeconds: number;
      isPaused?: boolean;
      playSessionId?: string;
      mediaSourceId?: string;
      event: "start" | "progress" | "stopped";
    },
  ): Promise<void> {
    const path =
      input.event === "start"
        ? "/Sessions/Playing"
        : input.event === "stopped"
          ? "/Sessions/Playing/Stopped"
          : "/Sessions/Playing/Progress";

    await this.httpFor(userContext).request("POST", path, {
      body: {
        ItemId: input.itemId,
        PositionTicks: Math.round(input.positionSeconds * 10_000_000),
        IsPaused: input.isPaused ?? false,
        PlaySessionId: input.playSessionId,
        MediaSourceId: input.mediaSourceId,
      },
      allowStatuses: [200, 204],
    });
  }

  /** Trigger a full library scan (admin/user depending on Jellyfin permissions). */
  async refreshLibrary(userContext: UserContext): Promise<void> {
    await this.httpFor(userContext).request("POST", "/Library/Refresh", {
      allowStatuses: [200, 204],
    });
  }

  /**
   * Notify Jellyfin that files appeared under known library paths so a targeted
   * scan can pick them up without waiting for a full refresh.
   */
  async notifyLibraryPathsUpdated(
    userContext: UserContext,
    paths: string[],
  ): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    await this.httpFor(userContext).request("POST", "/Library/Media/Updated", {
      body: {
        Updates: unique.map((Path) => ({
          Path,
          UpdateType: "Created",
        })),
      },
      allowStatuses: [200, 204],
    });
  }

  /** Proxy helper used by the API stream route. */
  async openStream(
    userContext: UserContext,
    itemId: string,
    opts: {
      mediaSourceId: string;
      playMethod?: "DirectPlay" | "DirectStream" | "Transcode";
      playSessionId?: string;
      audioStreamIndex?: number;
      transcodingPath?: string;
      /** Extra path/query from HLS segment requests */
      jellyfinPath?: string;
      /** Forward Range for seeking */
      range?: string;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    let url: URL;

    if (opts.jellyfinPath) {
      url = this.resolveJellyfinMediaUrl(opts.jellyfinPath, { allowApiPaths: false });
    } else if (opts.playMethod === "Transcode" && opts.transcodingPath) {
      url = this.resolveJellyfinMediaUrl(opts.transcodingPath, { allowApiPaths: false });
    } else if (opts.playMethod === "DirectStream" || opts.playMethod === "Transcode") {
      // Remux / audio-transcode to AAC when DirectPlay is unsafe for browsers.
      url = new URL(`${this.baseUrl}/Videos/${encodeURIComponent(itemId)}/stream.mp4`);
      url.searchParams.set("mediaSourceId", opts.mediaSourceId);
      url.searchParams.set("VideoCodec", "h264");
      url.searchParams.set("AudioCodec", "aac");
      url.searchParams.set("AudioBitrate", "384000");
      url.searchParams.set("MaxAudioChannels", "2");
      url.searchParams.set("TranscodingContainer", "mp4");
      url.searchParams.set("TranscodingProtocol", "http");
      if (opts.playSessionId) url.searchParams.set("PlaySessionId", opts.playSessionId);
      if (opts.audioStreamIndex != null) {
        url.searchParams.set("AudioStreamIndex", String(opts.audioStreamIndex));
      }
    } else {
      url = new URL(`${this.baseUrl}/Videos/${encodeURIComponent(itemId)}/stream`);
      url.searchParams.set("static", "true");
      url.searchParams.set("mediaSourceId", opts.mediaSourceId);
      if (opts.playSessionId) url.searchParams.set("PlaySessionId", opts.playSessionId);
      if (opts.audioStreamIndex != null) {
        url.searchParams.set("AudioStreamIndex", String(opts.audioStreamIndex));
      }
    }

    // Prefer Authorization header; api_key helps some Jellyfin media paths.
    // Only attach after the URL is confirmed to be same-origin with this.baseUrl.
    if (!url.searchParams.has("api_key")) {
      url.searchParams.set("api_key", userContext.jellyfinAccessToken);
    }

    const headers: Record<string, string> = {
      Authorization: mediaBrowserAuth({
        client: this.clientName,
        device: userContext.deviceName,
        deviceId: userContext.deviceId,
        version: this.clientVersion,
        token: userContext.jellyfinAccessToken,
      }),
    };
    if (opts.range) headers.Range = opts.range;

    const res = await (this.fetchImpl ?? fetch)(url, {
      headers,
      signal: opts.signal,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new ProviderError("Jellyfin stream redirected off expected origin", {
        code: "unavailable",
        provider: "jellyfin",
        statusCode: res.status,
      });
    }
    if (!res.ok && res.status !== 206) {
      throw new ProviderError(`Jellyfin stream failed: ${res.status}`, {
        code: classifyOrUnknown(res.status),
        provider: "jellyfin",
        statusCode: res.status,
      });
    }
    return res;
  }

  /**
   * Resolve a client-supplied Jellyfin media path to this server's base URL.
   * Rejects absolute off-host URLs, userinfo, and path traversal.
   */
  resolveJellyfinMediaUrl(
    rawPath: string,
    opts?: { allowApiPaths?: boolean },
  ): URL {
    const path = normalizeJellyfinRelativePath(rawPath, this.baseUrl);
    if (!path) {
      throw new ProviderError("Invalid Jellyfin media path", {
        code: "unavailable",
        provider: "jellyfin",
        statusCode: 400,
      });
    }
    if (!opts?.allowApiPaths && !isJellyfinMediaPath(path)) {
      throw new ProviderError("Jellyfin path is not a media stream path", {
        code: "unavailable",
        provider: "jellyfin",
        statusCode: 400,
      });
    }
    return new URL(`${this.baseUrl}${path}`);
  }

  /** Text subtitle (SRT/VTT/ASS) as WebVTT. Bitmap subs such as PGS are not supported. */
  async openSubtitle(
    userContext: UserContext,
    itemId: string,
    mediaSourceId: string,
    index: number,
  ): Promise<Response> {
    const url = new URL(
      `${this.baseUrl}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${index}/Stream.vtt`,
    );
    url.searchParams.set("api_key", userContext.jellyfinAccessToken);
    const res = await (this.fetchImpl ?? fetch)(url, {
      headers: {
        Authorization: mediaBrowserAuth({
          client: this.clientName,
          device: userContext.deviceName,
          deviceId: userContext.deviceId,
          version: this.clientVersion,
          token: userContext.jellyfinAccessToken,
        }),
      },
    });
    if (!res.ok) {
      throw new ProviderError(`Jellyfin subtitle failed: ${res.status}`, {
        code: classifyOrUnknown(res.status),
        provider: "jellyfin",
        statusCode: res.status,
      });
    }
    return res;
  }
}

function classifyOrUnknown(status: number) {
  if (status === 401 || status === 403) return "unauthorized" as const;
  if (status === 404) return "not_found" as const;
  return "unavailable" as const;
}

function parseLatestItems(data: unknown): JellyfinItem[] {
  if (Array.isArray(data)) {
    return data
      .map((item) => JellyfinItemSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }
  const parsed = JellyfinItemsResponseSchema.safeParse(data);
  return parsed.success ? (parsed.data.Items ?? []) : [];
}

function resolvePlayMethod(source: {
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string | null;
}): "DirectPlay" | "DirectStream" | "Transcode" {
  if (source.SupportsDirectPlay) return "DirectPlay";
  if (source.TranscodingUrl || source.SupportsTranscoding) {
    // Prefer HLS/transcode when Jellyfin rejected DirectPlay (usually incompatible audio).
    if (source.TranscodingUrl) return "Transcode";
  }
  if (source.SupportsDirectStream) return "DirectStream";
  if (source.SupportsTranscoding) return "Transcode";
  // Never fall back to blind DirectPlay — Chrome will show video with silent AC3/DTS.
  return "DirectStream";
}

const UNSAFE_BROWSER_AUDIO = new Set([
  "ac3",
  "eac3",
  "e-ac-3",
  "dca",
  "dts",
  "dtshd",
  "truehd",
  "mlp",
  "pcm",
  "flac",
]);

function defaultAudioCodec(source: {
  DefaultAudioStreamIndex?: number | null;
  MediaStreams?: Array<{
    Type?: string;
    Codec?: string | null;
    Index?: number;
    IsDefault?: boolean;
  }> | null;
}): string | undefined {
  const streams = source.MediaStreams ?? [];
  const audio = streams.filter((s) => s.Type === "Audio");
  if (!audio.length) return undefined;
  const byIndex =
    source.DefaultAudioStreamIndex != null
      ? audio.find((s) => s.Index === source.DefaultAudioStreamIndex)
      : undefined;
  const chosen = byIndex ?? audio.find((s) => s.IsDefault) ?? audio[0];
  return chosen?.Codec ?? undefined;
}

function isBrowserSafeAudio(codec: string | undefined): boolean {
  if (!codec) return false;
  const c = codec.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (UNSAFE_BROWSER_AUDIO.has(c) || UNSAFE_BROWSER_AUDIO.has(codec.toLowerCase())) {
    return false;
  }
  return c === "aac" || c === "mp3" || c === "opus" || c === "vorbis" || c === "mp4a" || c.startsWith("aac");
}

const TEXT_SUB_CODECS = new Set([
  "srt",
  "subrip",
  "vtt",
  "webvtt",
  "ass",
  "ssa",
  "ttml",
  "mov_text",
  "tx3g",
  "text",
]);

const BITMAP_SUB_CODECS = new Set([
  "pgssub",
  "pgs",
  "hdmv_pgs_subtitle",
  "dvdsub",
  "dvd_subtitle",
  "vobsub",
  "dvbsub",
  "dvb_subtitle",
]);

function isBrowserTextSubtitle(stream: {
  Codec?: string | null;
  IsTextSubtitleStream?: boolean;
  IsExternal?: boolean;
}): boolean {
  const codec = (stream.Codec ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (BITMAP_SUB_CODECS.has(codec)) return false;
  if (stream.IsTextSubtitleStream) return true;
  if (TEXT_SUB_CODECS.has(codec)) return true;
  // Bazarr writes external text sidecars. Jellyfin marks those external.
  return Boolean(stream.IsExternal);
}

function subtitleLabelFromStream(
  stream: {
    DisplayTitle?: string | null;
    Language?: string | null;
    IsForced?: boolean;
    IsHearingImpaired?: boolean;
  },
  index: number,
): string {
  const base = stream.DisplayTitle ?? stream.Language ?? `Subtitle ${index}`;
  const extras: string[] = [];
  if (stream.IsHearingImpaired && !/sdh|hearing/i.test(base)) extras.push("SDH");
  if (stream.IsForced && !/forced/i.test(base)) extras.push("Forced");
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

/**
 * Prefer Jellyfin's suggestion, but never DirectPlay unsafe audio codecs.
 * DirectStream / Transcode paths force AAC in openStream().
 */
function resolvePlayMethodForBrowser(source: {
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string | null;
  DefaultAudioStreamIndex?: number | null;
  MediaStreams?: Array<{
    Type?: string;
    Codec?: string | null;
    Index?: number;
    IsDefault?: boolean;
  }> | null;
}): "DirectPlay" | "DirectStream" | "Transcode" {
  const method = resolvePlayMethod(source);
  if (method !== "DirectPlay") return method;
  if (isBrowserSafeAudio(defaultAudioCodec(source))) return "DirectPlay";
  if (source.TranscodingUrl) return "Transcode";
  if (source.SupportsDirectStream) return "DirectStream";
  if (source.SupportsTranscoding) return "Transcode";
  return "DirectStream";
}

/**
 * Browser-safe profile. Do NOT advertise DTS/TrueHD/EAC3/AC3 as DirectPlay —
 * Chromium will play video and silently drop unsupported audio.
 */
function browserDeviceProfile() {
  // No AC3/DTS/TrueHD/FLAC in DirectPlay — Chrome plays video and drops them silently.
  const videoAudio = "aac,mp3,opus,vorbis";
  const videoCodecs = "h264,vp8,vp9,av1";
  return {
    Name: "Streamerr Web",
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 120_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      {
        Container: "mp4,m4v,mov",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: videoAudio,
      },
      {
        Container: "webm",
        Type: "Video",
        VideoCodec: "vp8,vp9,av1",
        AudioCodec: "vorbis,opus",
      },
      {
        Container: "mkv",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: videoAudio,
      },
      { Container: "mp3", Type: "Audio", AudioCodec: "mp3" },
      { Container: "mp4,m4a,aac", Type: "Audio", AudioCodec: "aac" },
      { Container: "webm,webma,opus", Type: "Audio", AudioCodec: "opus" },
    ],
    TranscodingProfiles: [
      {
        Container: "ts",
        Type: "Video",
        VideoCodec: "h264",
        AudioCodec: "aac",
        Protocol: "hls",
        Context: "Streaming",
        MaxAudioChannels: "2",
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: "mp4",
        Type: "Video",
        VideoCodec: "h264",
        AudioCodec: "aac",
        Protocol: "http",
        Context: "Streaming",
        MaxAudioChannels: "2",
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: "VideoAudio",
        Codec: "aac",
        Conditions: [
          {
            Condition: "LessThanEqual",
            Property: "AudioChannels",
            Value: "2",
            IsRequired: false,
          },
        ],
      },
    ],
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "srt", Method: "External" },
      { Format: "ass", Method: "Encode" },
      { Format: "ssa", Method: "Encode" },
      { Format: "pgssub", Method: "Encode" },
    ],
    ResponseProfiles: [],
  };
}

/**
 * Turn a Jellyfin-supplied or client-supplied path into a same-origin relative
 * path+query under `baseUrl`. Rejects off-host absolute URLs and `..`.
 */
export function normalizeJellyfinRelativePath(
  raw: string,
  baseUrl: string,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("..")) return null;

  let pathAndQuery: string;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let absolute: URL;
    try {
      absolute = new URL(trimmed);
    } catch {
      return null;
    }
    let base: URL;
    try {
      base = new URL(baseUrl);
    } catch {
      return null;
    }
    if (absolute.origin !== base.origin) return null;
    if (absolute.username || absolute.password) return null;
    pathAndQuery = `${absolute.pathname}${absolute.search}`;
  } else if (trimmed.includes("://")) {
    return null;
  } else {
    pathAndQuery = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (pathAndQuery.includes("..")) return null;
  return pathAndQuery;
}

/** Allow only video/audio/hls media endpoints — not general Jellyfin API paths. */
export function isJellyfinMediaPath(pathAndQuery: string): boolean {
  const path = pathAndQuery.split("?")[0]?.toLowerCase() ?? "";
  return (
    path.includes("/videos/") ||
    path.includes("/audio/") ||
    path.includes("/mediasource") ||
    path.endsWith(".m3u8") ||
    path.endsWith(".ts") ||
    path.endsWith(".mp4") ||
    path.endsWith(".webm") ||
    path.includes("/hls/") ||
    path.includes("hls1/") ||
    path.includes("/live/")
  );
}

export { ticksToSeconds, itemMatchesTmdb, hasPlayableMedia, extractTmdbId };
