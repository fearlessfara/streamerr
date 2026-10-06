import { useWindowDimensions } from "react-native";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Screen-driven sizes so ~2–3 rails fit in the viewport like Netflix on TV. */
export function useTvLayout() {
  const { width, height } = useWindowDimensions();

  const headerH = Math.round(clamp(height * 0.065, 52, 64));
  const pageX = Math.round(clamp(width * 0.025, 28, 48));

  // ~6 cards across on 1080p so rails stay short enough for 2–3 on screen.
  const cardsAcross = width >= 1800 ? 6.2 : width >= 1400 ? 5.6 : width >= 1100 ? 5.0 : 4.0;
  const cardGap = Math.round(clamp(width * 0.007, 8, 12));
  const cardWidth = Math.round(
    (width - pageX * 2 - cardGap * Math.floor(cardsAcross)) / cardsAcross,
  );
  const posterH = Math.round((cardWidth * 9) / 16);
  const titleSize = Math.round(clamp(cardWidth * 0.052, 12, 15));
  const metaSize = Math.round(clamp(cardWidth * 0.045, 11, 13));
  const titleLine = titleSize + 3;
  const metaLine = metaSize + 3;
  const cardTextGap = 4;
  const cardH = posterH + cardTextGap + titleLine + metaLine;
  const railTitleSize = Math.round(clamp(height * 0.016, 15, 18));
  const railTitleH = railTitleSize + 8;
  const railGap = Math.round(clamp(height * 0.012, 8, 14));
  const railListH = cardH + 2;

  // Billboard sized so two full rails sit under it on this panel.
  const contentH = height - headerH;
  const twoRails = railTitleH + railListH + railGap + railTitleH + railListH;
  const maxHero = Math.max(140, contentH - twoRails - railTitleH - 20);
  const heroH = Math.round(clamp(height * 0.2, 140, Math.min(maxHero, 220)));

  return {
    width,
    height,
    headerH,
    pageX,
    cardWidth,
    cardGap,
    posterH,
    cardH,
    titleSize,
    metaSize,
    titleLine,
    metaLine,
    cardTextGap,
    railTitleSize,
    railTitleH,
    railGap,
    railListH,
    heroH,
    artMaxWidth: Math.min(640, cardWidth * 2),
  };
}

export type TvLayout = ReturnType<typeof useTvLayout>;
