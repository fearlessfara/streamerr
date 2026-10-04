import type { Media, MediaType } from "@streamerr/shared";
import { resolvePreferredAction } from "@streamerr/shared";
import { extractTmdbId, hasPlayableMedia, ticksToSeconds } from "./identity.js";
import type { JellyfinItem } from "./schemas.js";

function mapMediaType(item: JellyfinItem): MediaType {
  switch (item.Type) {
    case "Movie":
      return "movie";
    case "Series":
      return "tv";
    case "Episode":
      return "episode";
    default:
      return "other";
  }
}

export function mapJellyfinItemToMedia(
  item: JellyfinItem,
  opts: { jellyfinBaseUrl: string; imageProxyBase?: string },
): Media {
  const mediaType = mapMediaType(item);
  const tmdbId = extractTmdbId(item);
  const canPlay = hasPlayableMedia(item) || item.Type === "Episode" || item.Type === "Movie";
  const positionSeconds = ticksToSeconds(item.UserData?.PlaybackPositionTicks);
  const durationSeconds = ticksToSeconds(item.RunTimeTicks);

  const imageBase = opts.imageProxyBase
    ? `${opts.imageProxyBase.replace(/\/+$/, "")}/api/images/jellyfin/${item.Id}`
    : `${opts.jellyfinBaseUrl.replace(/\/+$/, "")}/Items/${item.Id}/Images`;

  const posterUrl = item.ImageTags?.Primary ? `${imageBase}/Primary` : undefined;
  const backdropUrl =
    item.BackdropImageTags && item.BackdropImageTags.length > 0
      ? `${imageBase}/Backdrop`
      : undefined;

  const title =
    item.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} S${item.ParentIndexNumber ?? "?"}E${item.IndexNumber ?? "?"}`
      : (item.Name ?? "Untitled");

  const availability = [
    {
      provider: "jellyfin" as const,
      available: true,
      itemId: item.Id,
      canPlay,
      positionSeconds,
      durationSeconds,
    },
  ];

  return {
    identity: {
      jellyfinItemId: item.Id,
      ...(tmdbId !== undefined ? { tmdbId } : {}),
      mediaType,
      ...(item.Type === "Episode"
        ? {
            seasonNumber: item.ParentIndexNumber ?? undefined,
            episodeNumber: item.IndexNumber ?? undefined,
          }
        : {}),
    },
    metadata: {
      title,
      year: item.ProductionYear ?? undefined,
      overview: item.Overview ?? undefined,
      posterUrl,
      backdropUrl,
      runtimeMinutes:
        durationSeconds !== undefined ? Math.round(durationSeconds / 60) : undefined,
    },
    availability,
    preferredAction: resolvePreferredAction(availability),
  };
}
