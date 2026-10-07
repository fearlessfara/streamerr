import type { PlaybackSource, SubtitleTrack } from "@streamerr/shared";

/** Imperative transport controls exposed by the video surface (web / native). */
export type VideoTransport = {
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setMuted: (muted: boolean) => void;
  getMuted: () => boolean;
  setRate: (rate: number) => void;
  getRate: () => number;
  requestFullscreen: () => Promise<void> | void;
  exitFullscreen: () => Promise<void> | void;
  isFullscreen: () => boolean;
};

/** Props every platform video surface must accept (native Video / web MSE). */
export type VideoSurfaceProps = {
  source: PlaybackSource;
  uri: string;
  headers: Record<string, string>;
  paused: boolean;
  isLive: boolean;
  startPositionSeconds?: number;
  audioTrackIndex?: number | null;
  subtitleIndex?: number | null;
  subtitleTracks: SubtitleTrack[];
  onProgress: (info: { currentTime: number; duration?: number }) => void;
  onLoad: (info: { duration: number }) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  onSeekRequest?: (seek: (seconds: number) => void) => void;
  onTransportReady?: (transport: VideoTransport) => void;
};
