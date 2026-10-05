import { describe, expect, it, vi } from "vitest";
import type { MediaIdentity, PlaybackSource } from "@streamerr/shared";
import { PlaybackResolver } from "./playback-resolver.js";

describe("PlaybackResolver IPTV auto-cache", () => {
  const identity: MediaIdentity = { tmdbId: 550, mediaType: "movie" };

  it("returns buffering when cache starts but is not yet playable", async () => {
    const ensureCacheForPlay = vi.fn(async () => ({
      id: "acq-1",
      identity,
      mode: "cache" as const,
      state: "downloading" as const,
      bytesDownloaded: 100,
      playbackAvailable: false,
      source: { provider: "dispatcharr" as const, uuid: "11111111-1111-1111-1111-111111111111" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const acquisitions = {
      cacheAvailabilityFor: () => null,
      ensureCacheForPlay,
      get: () => undefined,
    };

    const dispatcharr = {
      resolveVodPlayback: true,
      findVodByTmdb: vi.fn(async () => ({
        identity,
        metadata: { title: "Fight Club", durationSeconds: 8400 },
        availability: [
          {
            provider: "dispatcharr" as const,
            available: true,
            canPlay: true,
            uuid: "11111111-1111-1111-1111-111111111111",
            movieId: 1,
            candidates: [{ streamId: "s1" }],
          },
        ],
        preferredAction: "PLAY_IPTV" as const,
      })),
    };

    const jellyfin = {
      findByTmdb: vi.fn(async () => null),
      resolvePlayback: vi.fn(async () => null),
    };

    const resolver = new PlaybackResolver(
      jellyfin as never,
      dispatcharr as never,
      undefined,
      acquisitions as never,
    );

    const result = await resolver.resolve({} as never, identity);
    expect(result).toEqual({ status: "buffering", acquisitionId: "acq-1" });
    expect(ensureCacheForPlay).toHaveBeenCalledOnce();
  });

  it("returns ready without subtitle tracks; listSubtitles enriches later", async () => {
    const acquisitions = {
      cacheAvailabilityFor: () => ({
        provider: "cache" as const,
        available: true,
        acquisitionId: "acq-fast",
        bytesDownloaded: 5_000_000,
        totalBytes: 10_000_000,
        playbackAvailable: true,
        complete: false,
      }),
      ensureCacheForPlay: vi.fn(),
      get: () => ({
        id: "acq-fast",
        mode: "cache",
        cacheExpiresAt: "2099-01-01T00:00:00.000Z",
      }),
    };

    const jellyfin = {
      findByTmdb: vi.fn(async () => null),
      resolvePlayback: vi.fn(async () => null as PlaybackSource | null),
    };

    const bazarr = {
      isConfigured: () => true,
      listSubtitles: vi.fn(async () => [
        {
          index: 0,
          language: "en",
          label: "English",
          url: "/api/playback/bazarr/subtitle/1",
        },
      ]),
    };

    const resolver = new PlaybackResolver(
      jellyfin as never,
      { resolveVodPlayback: true } as never,
      undefined,
      acquisitions as never,
      undefined,
      bazarr as never,
    );

    const result = await resolver.resolve({} as never, identity);
    expect(result?.status).toBe("ready");
    if (result?.status === "ready") {
      expect(result.source.subtitles).toBeUndefined();
    }

    const tracks = await resolver.listSubtitles({} as never, identity, {
      provider: "cache",
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.url).toContain("bazarr");
    expect(bazarr.listSubtitles).toHaveBeenCalledOnce();
  });

  it("returns ready cache source when playbackAvailable", async () => {
    const cacheSourceBits = {
      acquisitionId: "acq-2",
      bytesDownloaded: 5_000_000,
      totalBytes: 10_000_000,
      playbackAvailable: true,
      complete: false,
    };

    const acquisitions = {
      cacheAvailabilityFor: () => ({
        provider: "cache" as const,
        available: true,
        ...cacheSourceBits,
      }),
      ensureCacheForPlay: vi.fn(),
      get: () => ({
        id: "acq-2",
        mode: "cache",
        cacheExpiresAt: "2099-01-01T00:00:00.000Z",
      }),
    };

    const jellyfin = {
      findByTmdb: vi.fn(async () => null),
      resolvePlayback: vi.fn(async () => null as PlaybackSource | null),
    };

    const resolver = new PlaybackResolver(
      jellyfin as never,
      { resolveVodPlayback: true } as never,
      undefined,
      acquisitions as never,
    );

    const result = await resolver.resolve({} as never, identity);
    expect(result?.status).toBe("ready");
    if (result?.status === "ready") {
      expect(result.source.provider).toBe("cache");
      expect(result.source.delivery.url).toContain("/playback/cache/acq-2/hls/index.m3u8");
      expect(result.source.hls).toBe(true);
      expect(result.source.downloadComplete).toBe(false);
    }
    expect(acquisitions.ensureCacheForPlay).not.toHaveBeenCalled();
  });
});
