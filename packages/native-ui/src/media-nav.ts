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

export function detailsSeedFromMedia(media: Media): DetailsMediaSeed | undefined {
  const { tmdbId, mediaType } = media.identity;
  if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) return undefined;
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
  const { jellyfinItemId, tmdbId, mediaType } = media.identity;
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
