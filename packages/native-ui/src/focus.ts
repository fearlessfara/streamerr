export type TvPressState = { pressed: boolean; focused?: boolean };

/** TV / RN-web Pressable style callback may include `focused`. */
export function isTvFocused(state: { pressed: boolean }): boolean {
  return Boolean((state as TvPressState).focused);
}
