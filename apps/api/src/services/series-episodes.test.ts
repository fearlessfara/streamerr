import { describe, expect, it } from "vitest";
import type { Media } from "@streamerr/shared";
import { mergeSeriesEpisodes } from "./series-episodes.js";

function episode(
  partial: Pick<Media, "availability"> & {
    season: number;
    episode: number;
    title: string;
    overview?: string;
    stillUrl?: string;
    jellyfinItemId?: string;
  },
): Media {
  return {
    identity: {
      tmdbId: 5920,
      mediaType: "episode",
      seasonNumber: partial.season,
      episodeNumber: partial.episode,
      ...(partial.jellyfinItemId ? { jellyfinItemId: partial.jellyfinItemId } : {}),
    },
    metadata: {
      title: partial.title,
      overview: partial.overview,
      stillUrl: partial.stillUrl,
    },
    availability: partial.availability,
    preferredAction: "NONE",
  };
}

describe("mergeSeriesEpisodes", () => {
  it("keeps the Seerr guide and plays an episode that exists only on IPTV", () => {
    const { items } = mergeSeriesEpisodes(5920, {
      guide: [
        episode({
          season: 1,
          episode: 1,
          title: "Pilot",
          overview: "The first one.",
          stillUrl: "https://image.tmdb.org/t/p/w300/still.jpg",
          availability: [{ provider: "seerr", requestable: true, mediaStatus: "UNKNOWN" }],
        }),
        episode({
          season: 1,
          episode: 2,
          title: "Second",
          overview: "Not on IPTV.",
          availability: [{ provider: "seerr", requestable: true, mediaStatus: "UNKNOWN" }],
        }),
      ],
      jellyfin: [],
      iptv: [
        episode({
          season: 1,
          episode: 1,
          title: "EN - Show - S01E01 - Pilot",
          availability: [
            {
              provider: "dispatcharr",
              available: true,
              episodeId: 9,
              uuid: "ep-uuid",
              candidates: [],
              canPlay: true,
            },
          ],
        }),
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Pilot",
      overview: "The first one.",
      stillUrl: "https://image.tmdb.org/t/p/w300/still.jpg",
      preferredAction: "PLAY_IPTV",
    });
    expect(items[1]?.preferredAction).toBe("REQUEST");
  });

  it("still lists IPTV episodes when Seerr has no guide", () => {
    const { seasons, items } = mergeSeriesEpisodes(5920, {
      guide: [],
      jellyfin: [],
      iptv: [
        episode({
          season: 2,
          episode: 3,
          title: "IPTV only",
          availability: [
            {
              provider: "dispatcharr",
              available: true,
              uuid: "ep-uuid",
              candidates: [],
              canPlay: true,
            },
          ],
        }),
      ],
    });
    expect(seasons).toEqual([2]);
    expect(items[0]?.preferredAction).toBe("PLAY_IPTV");
  });
});
