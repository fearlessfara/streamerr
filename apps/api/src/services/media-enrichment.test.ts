import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Media } from "@streamerr/shared";
import * as schema from "../db/schema.js";
import { enrichDiscoveryRow } from "./media-enrichment.js";
import { applyCatalogWinners } from "./vod-catalog-sync.js";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE dispatcharr_tmdb_index (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      dispatcharr_id INTEGER NOT NULL,
      uuid TEXT NOT NULL,
      stream_id TEXT,
      title TEXT,
      catalogue_language TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tmdb_id, media_type)
    );
  `);
  return drizzle(sqlite, { schema });
}

function seerrMovie(tmdbId: number, title: string): Media {
  return {
    identity: { tmdbId, mediaType: "movie" },
    metadata: { title },
    availability: [
      {
        provider: "seerr",
        requestable: true,
        mediaStatus: "UNKNOWN",
      },
    ],
    preferredAction: "REQUEST",
  };
}

function seerrSeries(tmdbId: number, title: string): Media {
  return {
    identity: { tmdbId, mediaType: "tv" },
    metadata: { title },
    availability: [
      {
        provider: "seerr",
        requestable: true,
        mediaStatus: "UNKNOWN",
      },
    ],
    preferredAction: "REQUEST",
  };
}

describe("enrichDiscoveryRow", () => {
  it("marks an indexed movie as PLAY_IPTV", () => {
    const db = makeDb();
    applyCatalogWinners(
      db,
      [
        {
          tmdbId: 550,
          mediaType: "movie",
          dispatcharrId: 99,
          uuid: "fight-club",
          title: "EN - Fight Club",
          catalogueLanguage: "en",
        },
      ],
      new Date(),
    );

    const ctx = {
      db,
      dispatcharr: { getPreferredLanguages: () => ["en"] },
    } as unknown as Parameters<typeof enrichDiscoveryRow>[0];

    const [out] = enrichDiscoveryRow(ctx, [seerrMovie(550, "Fight Club")]);
    expect(out?.preferredAction).toBe("PLAY_IPTV");
    expect(out?.availability.some((a) => a.provider === "dispatcharr" && a.canPlay)).toBe(
      true,
    );
  });

  it("keeps a Seerr-only title as REQUEST (Download on the card)", () => {
    const db = makeDb();
    const ctx = {
      db,
      dispatcharr: { getPreferredLanguages: () => ["en"] },
    } as unknown as Parameters<typeof enrichDiscoveryRow>[0];

    const [out] = enrichDiscoveryRow(ctx, [seerrMovie(999, "Missing On Iptv")]);
    expect(out?.preferredAction).toBe("REQUEST");
    expect(out?.availability.some((a) => a.provider === "dispatcharr")).toBe(false);
  });

  it("marks indexed series available without canPlay so the card opens details", () => {
    const db = makeDb();
    applyCatalogWinners(
      db,
      [
        {
          tmdbId: 1396,
          mediaType: "tv",
          dispatcharrId: 7,
          uuid: "breaking-bad",
          title: "EN - Breaking Bad",
          catalogueLanguage: "en",
        },
      ],
      new Date(),
    );

    const ctx = {
      db,
      dispatcharr: { getPreferredLanguages: () => ["en"] },
    } as unknown as Parameters<typeof enrichDiscoveryRow>[0];

    const [out] = enrichDiscoveryRow(ctx, [seerrSeries(1396, "Breaking Bad")]);
    const da = out?.availability.find((a) => a.provider === "dispatcharr");
    expect(da?.available).toBe(true);
    expect(da && "canPlay" in da ? da.canPlay : undefined).toBe(false);
    // Not PLAY_IPTV — episode-level play only.
    expect(out?.preferredAction).toBe("REQUEST");
  });

  it("prefers library membership over IPTV when libraryKeys is set", () => {
    const db = makeDb();
    applyCatalogWinners(
      db,
      [
        {
          tmdbId: 550,
          mediaType: "movie",
          dispatcharrId: 99,
          uuid: "fight-club",
          title: "EN - Fight Club",
          catalogueLanguage: "en",
        },
      ],
      new Date(),
    );

    const ctx = {
      db,
      dispatcharr: { getPreferredLanguages: () => ["en"] },
    } as unknown as Parameters<typeof enrichDiscoveryRow>[0];

    const [out] = enrichDiscoveryRow(ctx, [seerrMovie(550, "Fight Club")], {
      libraryKeys: new Set(["movie:550"]),
    });
    expect(out?.preferredAction).toBe("PLAY_JELLYFIN");
  });
});
