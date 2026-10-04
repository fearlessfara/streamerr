/** Streaming-service catalogue prefixes — never treat as languages. */
const SERVICE_PREFIXES = new Set([
  "d+",
  "dplus",
  "disney",
  "disney+",
  "nf",
  "netflix",
  "amzn",
  "amazon",
  "prime",
  "atvp",
  "apple",
  "hulu",
  "hbo",
  "max",
  "dsnp",
  "pcok",
  "peacock",
  "paramount",
  "pmtp",
]);

const QUALITY_PREFIXES = new Set(["4k", "uhd", "2160p", "1080p", "720p", "hdr", "dv"]);

/** Leading catalogue tag: "EN - Title", "4K-D+ - Title", "DE - Zoomania". */
const LEADING_TAG =
  /^(?:((?:4k|uhd|2160p|1080p|720p)[\s\-_.]*)?([a-z0-9+]{1,10}))\s*[-–—|:.]\s+/i;

export interface CatalogueLanguageHints {
  /** ISO-ish language from catalogue prefix (en, de, tr, …). */
  language?: string;
  /** Streaming platform hint (dplus, netflix, …). */
  platform?: string;
  evidence: string[];
}

export function normalizeLanguageTag(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!t || t === "und" || t === "unknown" || t === "null") return undefined;
  const map: Record<string, string> = {
    eng: "en",
    en: "en",
    deu: "de",
    ger: "de",
    de: "de",
    fra: "fr",
    fre: "fr",
    fr: "fr",
    spa: "es",
    es: "es",
    ita: "it",
    it: "it",
    por: "pt",
    pt: "pt",
    tur: "tr",
    tr: "tr",
    kur: "ku",
    ku: "ku",
    nld: "nl",
    dut: "nl",
    nl: "nl",
    pol: "pl",
    pl: "pl",
    rus: "ru",
    ru: "ru",
    jpn: "ja",
    ja: "ja",
    kor: "ko",
    ko: "ko",
    chi: "zh",
    zho: "zh",
    zh: "zh",
    ara: "ar",
    ar: "ar",
  };
  const primary = t.split("-")[0]!;
  return map[primary] ?? (primary.length <= 3 ? primary : undefined);
}

export function parseCatalogueLanguageHints(input: {
  name?: string;
  group?: string;
}): CatalogueLanguageHints {
  const evidence: string[] = [];
  let language: string | undefined;
  let platform: string | undefined;

  for (const text of [input.name, input.group].filter(Boolean) as string[]) {
    const m = text.match(LEADING_TAG);
    if (!m?.[2]) continue;
    const tag = m[2].toLowerCase();
    if (SERVICE_PREFIXES.has(tag)) {
      platform ??=
        tag === "d+" || tag === "disney+" || tag === "disney" || tag === "dsnp"
          ? "dplus"
          : tag === "nf"
            ? "netflix"
            : tag === "amzn" || tag === "prime"
              ? "amazon"
              : tag === "atvp"
                ? "apple"
                : tag;
      evidence.push(`platform:${platform}`);
      continue;
    }
    if (QUALITY_PREFIXES.has(tag)) continue;
    const lang = normalizeLanguageTag(tag);
    if (lang && !language) {
      language = lang;
      evidence.push(`catalogue_language:${lang}`);
    }
  }

  return { language, platform, evidence };
}

/**
 * Higher is better. Preferred[0] strongest.
 * Audio languages (when present) outweigh catalogue prefixes.
 */
export function scoreLanguagePreference(input: {
  preferredLanguages: string[];
  catalogueLanguage?: string;
  audioLanguages?: string[];
}): { score: number; reason: string; matched?: string } {
  const preferred: string[] = input.preferredLanguages
    .map((l) => normalizeLanguageTag(l))
    .filter((l): l is string => Boolean(l));
  if (!preferred.length) preferred.push("en");

  const audio = (input.audioLanguages ?? [])
    .map((l) => normalizeLanguageTag(l))
    .filter(Boolean) as string[];
  const catalogue = normalizeLanguageTag(input.catalogueLanguage);

  for (let i = 0; i < preferred.length; i++) {
    const p = preferred[i]!;
    if (audio.includes(p)) {
      return {
        score: 10_000 - i * 500,
        reason: `audio language ${p} matches preferred`,
        matched: p,
      };
    }
  }

  for (let i = 0; i < preferred.length; i++) {
    const p = preferred[i]!;
    if (catalogue === p) {
      return {
        score: 6_000 - i * 400,
        reason: `catalogue language ${p} matches preferred`,
        matched: p,
      };
    }
  }

  if (audio.length) {
    return {
      score: -4_000,
      reason: `audio languages [${audio.join(",")}] do not match preferred`,
    };
  }
  if (catalogue) {
    return {
      score: -3_000,
      reason: `catalogue language ${catalogue} does not match preferred`,
    };
  }
  return { score: 0, reason: "language unknown" };
}

export function isObviousLanguageMismatch(
  preferredLanguages: string[],
  catalogueLanguage?: string,
  audioLanguages?: string[],
): boolean {
  const preferred = new Set(
    preferredLanguages.map((l) => normalizeLanguageTag(l)).filter(Boolean) as string[],
  );
  if (!preferred.size) return false;
  const audio = (audioLanguages ?? [])
    .map((l) => normalizeLanguageTag(l))
    .filter(Boolean) as string[];
  if (audio.length && !audio.some((a) => preferred.has(a))) return true;
  const cat = normalizeLanguageTag(catalogueLanguage);
  if (cat && !preferred.has(cat) && !audio.length) return true;
  return false;
}

/** Parse comma-separated preferred language env (e.g. "it,en"). */
export function parsePreferredLanguages(raw?: string | null): string[] {
  if (!raw?.trim()) return ["en"];
  const list = raw
    .split(",")
    .map((l) => normalizeLanguageTag(l.trim()))
    .filter((l): l is string => Boolean(l));
  return list.length ? list : ["en"];
}

export interface CatalogueLanguageScored<T> {
  item: T;
  score: number;
  catalogueLanguage?: string;
}

/**
 * Soft-drop obvious catalogue language mismatches when a better variant exists,
 * then pick the highest language score (stable id tie-break).
 */
export function pickPreferredByCatalogueLanguage<T>(
  items: T[],
  preferredLanguages: string[],
  opts: {
    nameOf: (item: T) => string;
    idOf: (item: T) => number | string;
    groupOf?: (item: T) => string | undefined;
  },
): CatalogueLanguageScored<T> | null {
  if (!items.length) return null;

  const scored: CatalogueLanguageScored<T>[] = items.map((item) => {
    const hints = parseCatalogueLanguageHints({
      name: opts.nameOf(item),
      group: opts.groupOf?.(item),
    });
    const { score } = scoreLanguagePreference({
      preferredLanguages,
      catalogueLanguage: hints.language,
    });
    return { item, score, catalogueLanguage: hints.language };
  });

  const kept = scored.filter(
    (s) => !isObviousLanguageMismatch(preferredLanguages, s.catalogueLanguage),
  );
  const pool = kept.length ? kept : scored;
  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(opts.idOf(a.item)).localeCompare(String(opts.idOf(b.item)));
  });
  return pool[0] ?? null;
}
