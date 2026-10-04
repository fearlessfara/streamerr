import { describe, expect, it } from "vitest";
import {
  isObviousLanguageMismatch,
  normalizeLanguageTag,
  parseCatalogueLanguageHints,
  parsePreferredLanguages,
  pickPreferredByCatalogueLanguage,
  scoreLanguagePreference,
} from "./iptv-language.js";

describe("normalizeLanguageTag", () => {
  it("maps ISO639-2 and aliases", () => {
    expect(normalizeLanguageTag("eng")).toBe("en");
    expect(normalizeLanguageTag("ITA")).toBe("it");
    expect(normalizeLanguageTag("en-US")).toBe("en");
    expect(normalizeLanguageTag("und")).toBeUndefined();
  });
});

describe("parseCatalogueLanguageHints", () => {
  it("parses EN / IT / DE title prefixes", () => {
    expect(parseCatalogueLanguageHints({ name: "EN - Zootopia" }).language).toBe("en");
    expect(parseCatalogueLanguageHints({ name: "IT - Zootropolis" }).language).toBe("it");
    expect(parseCatalogueLanguageHints({ name: "DE - Zoomania" }).language).toBe("de");
  });

  it("does not treat streaming service prefixes as language", () => {
    const hints = parseCatalogueLanguageHints({ name: "NF - Zootopia" });
    expect(hints.language).toBeUndefined();
    expect(hints.platform).toBe("netflix");
  });

  it("skips quality prefixes and reads language after them", () => {
    // Leading quality+service: "4K-D+ - Title" → platform only
    const svc = parseCatalogueLanguageHints({ name: "4K-D+ - Zootopia" });
    expect(svc.platform).toBe("dplus");
    expect(svc.language).toBeUndefined();
  });

  it("inherits language from group when name is service-only", () => {
    const hints = parseCatalogueLanguageHints({
      name: "D+ - Zootopia",
      group: "DE - Zoomania",
    });
    expect(hints.platform).toBe("dplus");
    expect(hints.language).toBe("de");
  });
});

describe("scoreLanguagePreference", () => {
  it("prefers catalogue language match over mismatch", () => {
    const en = scoreLanguagePreference({
      preferredLanguages: ["en"],
      catalogueLanguage: "en",
    });
    const de = scoreLanguagePreference({
      preferredLanguages: ["en"],
      catalogueLanguage: "de",
    });
    expect(en.score).toBeGreaterThan(de.score);
    expect(en.score).toBe(6000);
    expect(de.score).toBe(-3000);
  });

  it("ranks preferred list order", () => {
    const it = scoreLanguagePreference({
      preferredLanguages: ["it", "en"],
      catalogueLanguage: "it",
    });
    const en = scoreLanguagePreference({
      preferredLanguages: ["it", "en"],
      catalogueLanguage: "en",
    });
    expect(it.score).toBeGreaterThan(en.score);
  });

  it("lets audio outweigh catalogue prefix", () => {
    const audio = scoreLanguagePreference({
      preferredLanguages: ["en"],
      catalogueLanguage: "de",
      audioLanguages: ["eng"],
    });
    expect(audio.score).toBe(10_000);
    expect(audio.matched).toBe("en");
  });

  it("scores unknown catalogue language as zero", () => {
    expect(
      scoreLanguagePreference({
        preferredLanguages: ["en"],
      }).score,
    ).toBe(0);
  });
});

describe("isObviousLanguageMismatch", () => {
  it("flags wrong catalogue language without audio", () => {
    expect(isObviousLanguageMismatch(["en"], "de")).toBe(true);
    expect(isObviousLanguageMismatch(["en"], "en")).toBe(false);
    expect(isObviousLanguageMismatch(["en"], undefined)).toBe(false);
  });
});

describe("pickPreferredByCatalogueLanguage", () => {
  const items = [
    { id: 1, name: "DE - Zoomania" },
    { id: 2, name: "EN - Zootopia" },
    { id: 3, name: "NF - Zootopia" },
    { id: 4, name: "KU - Zootopia" },
  ];

  it("picks EN when preferred is en", () => {
    const best = pickPreferredByCatalogueLanguage(items, ["en"], {
      nameOf: (i) => i.name,
      idOf: (i) => i.id,
    });
    expect(best?.item.name).toBe("EN - Zootopia");
    expect(best?.catalogueLanguage).toBe("en");
  });

  it("prefers IT when listed first and present", () => {
    const withIt = [...items, { id: 5, name: "IT - Zootropolis" }];
    const best = pickPreferredByCatalogueLanguage(withIt, ["it", "en"], {
      nameOf: (i) => i.name,
      idOf: (i) => i.id,
    });
    expect(best?.item.name).toBe("IT - Zootropolis");
  });

  it("falls back to EN when IT missing from it,en prefs", () => {
    const best = pickPreferredByCatalogueLanguage(items, ["it", "en"], {
      nameOf: (i) => i.name,
      idOf: (i) => i.id,
    });
    expect(best?.item.name).toBe("EN - Zootopia");
  });

  it("soft-drops DE/KU when EN exists", () => {
    const best = pickPreferredByCatalogueLanguage(items, ["en"], {
      nameOf: (i) => i.name,
      idOf: (i) => i.id,
    });
    expect(best?.item.name).not.toMatch(/^(DE|KU)\b/);
  });

  it("keeps service-only NF as unknown (not mismatch-only winner)", () => {
    const onlyNf = [{ id: 3, name: "NF - Zootopia" }];
    const best = pickPreferredByCatalogueLanguage(onlyNf, ["en"], {
      nameOf: (i) => i.name,
      idOf: (i) => i.id,
    });
    expect(best?.item.name).toBe("NF - Zootopia");
    expect(best?.score).toBe(0);
  });
});

describe("parsePreferredLanguages", () => {
  it("parses comma lists and defaults", () => {
    expect(parsePreferredLanguages("it, en")).toEqual(["it", "en"]);
    expect(parsePreferredLanguages("")).toEqual(["en"]);
    expect(parsePreferredLanguages(null)).toEqual(["en"]);
  });
});
