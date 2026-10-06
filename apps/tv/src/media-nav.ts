import type { Media } from "@streamerr/shared";
import type { Nav } from "./nav";

export function openMedia(navigation: Nav, media: Media) {
  const { jellyfinItemId, tmdbId, mediaType } = media.identity;
  if (tmdbId && (mediaType === "movie" || mediaType === "tv")) {
    navigation.navigate("Details", { type: mediaType, tmdbId });
    return;
  }
  if (jellyfinItemId) {
    navigation.navigate("Details", { jellyfinItemId });
  }
}
