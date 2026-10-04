import { describe, expect, it } from "vitest";
import { isBrowserSafeAudioCodec } from "./ffmpeg-remux.js";

describe("isBrowserSafeAudioCodec", () => {
  it("accepts common browser codecs", () => {
    expect(isBrowserSafeAudioCodec("aac")).toBe(true);
    expect(isBrowserSafeAudioCodec("mp3")).toBe(true);
    expect(isBrowserSafeAudioCodec("opus")).toBe(true);
    expect(isBrowserSafeAudioCodec("mp4a")).toBe(true);
    expect(isBrowserSafeAudioCodec("AAC")).toBe(true);
  });

  it("rejects AC3/DTS/TrueHD/FLAC", () => {
    expect(isBrowserSafeAudioCodec("ac3")).toBe(false);
    expect(isBrowserSafeAudioCodec("eac3")).toBe(false);
    expect(isBrowserSafeAudioCodec("dts")).toBe(false);
    expect(isBrowserSafeAudioCodec("truehd")).toBe(false);
    expect(isBrowserSafeAudioCodec("flac")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isBrowserSafeAudioCodec(undefined)).toBe(false);
    expect(isBrowserSafeAudioCodec("")).toBe(false);
  });
});
