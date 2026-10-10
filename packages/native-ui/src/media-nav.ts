import type { Media, PreferredAction } from "@streamerr/shared";

/** Lightweight card snapshot so Details can paint before the fast media API returns. */
export type DetailsMediaSeed = {
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  year?: number;
  overview?: string;
  runtimeMinutes?: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  preferredAction?: PreferredAction;
};

export type DetailsParams =
  | {
      type: "movie" | "tv";
      tmdbId: number;
      seed?: DetailsMediaSeed;
      jellyfinItemId?: undefined;
    }
  | {
      jellyfinItemId: string;
      type?: undefined;
      tmdbId?: undefined;
      seed?: DetailsMediaSeed;
    };

export type MediaNavigator = {
  navigate: (name: "Details", params: DetailsParams) => void;
};

/** Strip "S1E2" suffix from Jellyfin-style episode titles for series seeds. */
function seriesTitleFromEpisode(title: string): string {
  const m = /^(.*?)\s+S\d+E\d+/i.exec(title);
  return m?.[1]?.trim() || title;
}

export function detailsSeedFromMedia(media: Media): DetailsMediaSeed | undefined {
  const { tmdbId, mediaType } = media.identity;
  if (!tmdbId) return undefined;
  // Episodes open the series details page (Netflix jawbone) — seed as tv.
  if (mediaType === "episode") {
    return {
      title: seriesTitleFromEpisode(media.metadata.title),
      posterUrl: media.metadata.posterUrl,
      backdropUrl: media.metadata.backdropUrl,
      year: media.metadata.year,
      overview: media.metadata.overview,
      runtimeMinutes: media.metadata.runtimeMinutes,
      mediaType: "tv",
      tmdbId,
      preferredAction: media.preferredAction,
    };
  }
  if (mediaType !== "movie" && mediaType !== "tv") return undefined;
  return {
    title: media.metadata.title,
    posterUrl: media.metadata.posterUrl,
    backdropUrl: media.metadata.backdropUrl,
    year: media.metadata.year,
    overview: media.metadata.overview,
    runtimeMinutes: media.metadata.runtimeMinutes,
    mediaType,
    tmdbId,
    preferredAction: media.preferredAction,
  };
}

export function mediaFromDetailsSeed(seed: DetailsMediaSeed): Media {
  return {
    identity: { tmdbId: seed.tmdbId, mediaType: seed.mediaType },
    metadata: {
      title: seed.title,
      posterUrl: seed.posterUrl,
      backdropUrl: seed.backdropUrl,
      year: seed.year,
      overview: seed.overview,
      runtimeMinutes: seed.runtimeMinutes,
    },
    availability: [],
    preferredAction: seed.preferredAction ?? "NONE",
  };
}

export function openMedia(navigation: MediaNavigator, media: Media) {
  const { jellyfinItemId, jellyfinSeriesId, tmdbId, mediaType } = media.identity;

  // Netflix: episode / Continue Watching cards open series details, not the player.
  // Prefer the series Jellyfin id — episode ProviderIds.Tmdb is often the episode id.
  if (mediaType === "episode") {
    if (jellyfinSeriesId) {
      navigation.navigate("Details", { jellyfinItemId: jellyfinSeriesId });
      return;
    }
    if (tmdbId) {
      navigation.navigate("Details", {
        type: "tv",
        tmdbId,
        seed: detailsSeedFromMedia(media),
      });
      return;
    }
    if (jellyfinItemId) {
      navigation.navigate("Details", { jellyfinItemId });
    }
    return;
  }

  if (tmdbId && (mediaType === "movie" || mediaType === "tv")) {
    navigation.navigate("Details", {
      type: mediaType,
      tmdbId,
      seed: detailsSeedFromMedia(media),
    });
    return;
  }
  if (jellyfinItemId) {
    navigation.navigate("Details", { jellyfinItemId });
  }
}
