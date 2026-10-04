import { normalizeSubtitleLanguage, type SubtitleTrack } from "@streamerr/shared";

const KEY = "streamerr_subtitle_pref";

export type SubtitlePref =
  | { mode: "off" }
  | {
      mode: "on";
      language: string;
      forced?: boolean;
      hearingImpaired?: boolean;
    };

export function loadSubtitlePref(): SubtitlePref {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { mode: "off" };
    const parsed = JSON.parse(raw) as SubtitlePref;
    if (parsed?.mode === "off") return { mode: "off" };
    if (parsed?.mode === "on" && typeof parsed.language === "string") {
      return {
        mode: "on",
        language: normalizeSubtitleLanguage(parsed.language),
        forced: Boolean(parsed.forced),
        hearingImpaired: Boolean(parsed.hearingImpaired),
      };
    }
  } catch {
    /* ignore */
  }
  return { mode: "off" };
}

export function saveSubtitlePref(pref: SubtitlePref): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota / private mode */
  }
}

export function saveSubtitleOff(): void {
  saveSubtitlePref({ mode: "off" });
}

export function saveSubtitleTrack(track: SubtitleTrack): void {
  saveSubtitlePref({
    mode: "on",
    language: normalizeSubtitleLanguage(track.language) || "",
    forced: Boolean(track.forced),
    hearingImpaired: Boolean(track.hearingImpaired),
  });
}

/**
 * Restore the last subtitle choice for this title's tracks.
 * Default (no saved pref / Off): null. When On, match language (+ flags).
 */
export function resolveSubtitleIndex(
  tracks: SubtitleTrack[],
  pref: SubtitlePref = loadSubtitlePref(),
): number | null {
  if (!tracks.length || pref.mode === "off") return null;

  const wantLang = normalizeSubtitleLanguage(pref.language);
  const score = (track: SubtitleTrack, index: number) => {
    const lang = normalizeSubtitleLanguage(track.language);
    let value = 0;
    if (wantLang && lang === wantLang) value += 10;
    else if (!wantLang) value += 1;
    else return -1;
    if (Boolean(track.forced) === Boolean(pref.forced)) value += 2;
    if (Boolean(track.hearingImpaired) === Boolean(pref.hearingImpaired)) value += 1;
    return value * 100 - index;
  };

  let best: number | null = null;
  let bestScore = -1;
  for (let i = 0; i < tracks.length; i += 1) {
    const s = score(tracks[i]!, i);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  // Language saved but no match on this title — stay off rather than guessing.
  if (wantLang && bestScore < 10) return null;
  return best;
}
