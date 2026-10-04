import { describe, expect, it } from "vitest";
import { mapMediaInfoToRequestAvailability, mapSearchResultToMedia } from "./map.js";
import { SeerrMediaStatus, SeerrRequestStatus } from "./schemas.js";

describe("seerr map", () => {
  it("marks unknown media as requestable", () => {
    const avail = mapMediaInfoToRequestAvailability(null);
    expect(avail.requestable).toBe(true);
    expect(avail.mediaStatus).toBe("UNKNOWN");
  });

  it("does not request already available media", () => {
    const avail = mapMediaInfoToRequestAvailability({
      status: SeerrMediaStatus.AVAILABLE,
    });
    expect(avail.requestable).toBe(false);
    expect(avail.mediaStatus).toBe("AVAILABLE");
  });

  it("does not request pending requests", () => {
    const avail = mapMediaInfoToRequestAvailability({
      status: SeerrMediaStatus.UNKNOWN,
      requests: [{ status: SeerrRequestStatus.PENDING }],
    });
    expect(avail.requestable).toBe(false);
    expect(avail.requestStatus).toBe("PENDING");
  });

  it("maps movie search results", () => {
    const media = mapSearchResultToMedia({
      id: 550,
      mediaType: "movie",
      title: "Fight Club",
      releaseDate: "1999-10-15",
      overview: "An insomniac…",
      posterPath: "/poster.jpg",
      backdropPath: "/back.jpg",
    });
    expect(media?.identity.tmdbId).toBe(550);
    expect(media?.metadata.year).toBe(1999);
    expect(media?.metadata.posterUrl).toContain("/w500/poster.jpg");
    expect(media?.preferredAction).toBe("REQUEST");
  });

  it("skips person results", () => {
    expect(
      mapSearchResultToMedia({
        id: 1,
        mediaType: "person",
        name: "Someone",
      }),
    ).toBeNull();
  });
});
