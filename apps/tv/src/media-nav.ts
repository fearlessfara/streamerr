import type { Media } from "@streamerr/shared";
import { openMedia as open } from "@streamerr/native-ui";
import type { Nav } from "./nav";

export function openMedia(navigation: Nav, media: Media) {
  open(navigation, media);
}
