export type TvPressState = { pressed: boolean; focused?: boolean };

export function isTvFocused(state: { pressed: boolean }): boolean {
  return Boolean((state as TvPressState).focused);
}
