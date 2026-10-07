import type { Media } from "@streamerr/shared";
import { PosterCard as SharedPosterCard } from "@streamerr/native-ui";
import { useTvLayout } from "../layout";

export function PosterCard({
  media,
  onPress,
  onFocusCard,
  hasTVPreferredFocus,
}: {
  media: Media;
  onPress: () => void;
  onFocusCard?: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const layout = useTvLayout();
  return (
    <SharedPosterCard
      media={media}
      layout={layout}
      onPress={onPress}
      onFocusCard={onFocusCard}
      hasTVPreferredFocus={hasTVPreferredFocus}
      showFocusRing
      borderRadius={4}
    />
  );
}
