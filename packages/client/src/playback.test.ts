import { describe, expect, it } from "vitest";
import type { PlaybackSource } from "@streamerr/shared";
import { classifyPlayback, sessionCookieHeader } from "./playback.js";

function source(partial: {
  url: string;
  mimeType?: string;
  hls?: boolean;
  playMethod?: PlaybackSource["playMethod"];
}): PlaybackSource {
  return {
    provider: "jellyfin",
    delivery: { mode: "proxy", url: partial.url },
    directPlay: true,
    hls: partial.hls,
    mimeType: partial.mimeType,
    playMethod: partial.playMethod,
  };
}

describe("classifyPlayback", () => {
  it("classifies live MPEG-TS", () => {
    expect(
      classifyPlayback(source({ url: "/api/playback/dispatcharr/live/abc", mimeType: "video/mp2t" })),
    ).toBe("mpegts");
  });

  it("classifies HLS playlists", () => {
    expect(classifyPlayback(source({ url: "/api/playback/cache/1/hls/index.m3u8", hls: true }))).toBe(
      "hls",
    );
  });

  it("classifies progressive files", () => {
    expect(classifyPlayback(source({ url: "/api/playback/jellyfin/stream", mimeType: "video/mp4" }))).toBe(
      "progressive",
    );
  });
});

describe("sessionCookieHeader", () => {
  it("includes Cookie and a fetch-safe session header", () => {
    expect(sessionCookieHeader("abc")).toEqual({
      Cookie: "streamerr_session=abc",
      "x-streamerr-session": "abc",
    });
    expect(sessionCookieHeader(null)).toEqual({});
  });
});
