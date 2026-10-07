import type { Media } from "@streamerr/shared";
import { PosterCard as SharedPosterCard } from "@streamerr/native-ui";
import { useMobileLayout } from "../layout";

export function PosterCard({ media, onPress }: { media: Media; onPress: () => void }) {
  const layout = useMobileLayout();
  return <SharedPosterCard media={media} layout={layout} onPress={onPress} />;
}
