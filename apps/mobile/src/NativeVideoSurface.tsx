import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Video, {
  SelectedTrackType,
  TextTrackType,
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from "react-native-video";
import { absoluteUrl, classifyPlayback, getClient } from "@streamerr/client";
import type { VideoSurfaceProps } from "@streamerr/native-ui";
import { textSubtitles } from "@streamerr/client";

/** react-native-video surface implementing the shared VideoSurfaceProps contract. */
export function NativeVideoSurface(props: VideoSurfaceProps) {
  const ref = useRef<VideoRef>(null);
  const kind = classifyPlayback(props.source);
  const origin = getClient().baseUrl || "http://localhost";
  const videoType = kind === "hls" ? "m3u8" : kind === "mpegts" ? "mpegts" : undefined;

  useEffect(() => {
    props.onSeekRequest?.((seconds) => ref.current?.seek(seconds));
  }, [props.onSeekRequest]);

  const sideloaded = textSubtitles(props.subtitleTracks).map((track) => ({
    title: track.label || track.language || "Subtitle",
    language: (track.language?.slice(0, 2).toLowerCase() || "en") as "en",
    type: track.url.endsWith(".vtt") ? TextTrackType.VTT : TextTrackType.SUBRIP,
    uri: absoluteUrl(track.url, origin),
  }));

  const selectedTextTrack =
    props.subtitleIndex == null
      ? { type: SelectedTrackType.DISABLED }
      : { type: SelectedTrackType.INDEX, value: props.subtitleIndex };

  return (
    <Video
      ref={ref}
      source={{ uri: props.uri, headers: props.headers, type: videoType }}
      style={StyleSheet.absoluteFill}
      paused={props.paused}
      resizeMode="contain"
      onLoad={(data: OnLoadData) => {
        const d = Number.isFinite(data.duration) && data.duration > 0 ? data.duration : 0;
        props.onLoad({ duration: d });
      }}
      onProgress={(data: OnProgressData) => props.onProgress({ currentTime: data.currentTime })}
      onEnd={props.onEnd}
      onError={(e) => props.onError(e.error?.errorString ?? "Playback failed")}
      textTracks={sideloaded}
      selectedTextTrack={selectedTextTrack}
      reportBandwidth
      ignoreSilentSwitch="ignore"
      playInBackground={false}
      controls={false}
      // ExoPlayer paints its own always-on LIVE chip; we render ours in chrome.
      controlsStyles={{ hideLiveBadge: true }}
    />
  );
}
