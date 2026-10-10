import { useEffect, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import Video, {
  SelectedTrackType,
  TextTrackType,
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from "react-native-video";
import { classifyPlayback, getClient, playbackMediaUrl } from "@streamerr/client";
import type { VideoSurfaceProps } from "@streamerr/native-ui";
import { textSubtitles } from "@streamerr/client";

/** react-native-video surface implementing the shared VideoSurfaceProps contract. */
export function NativeVideoSurface(props: VideoSurfaceProps) {
  const ref = useRef<VideoRef>(null);
  const kind = classifyPlayback(props.source);
  const origin = getClient().baseUrl || "http://localhost:8787";
  const videoType = kind === "hls" ? "m3u8" : kind === "mpegts" ? "mpegts" : undefined;

  useEffect(() => {
    props.onSeekRequest?.((seconds) => ref.current?.seek(seconds));
  }, [props.onSeekRequest]);

  useEffect(() => {
    props.onTransportReady?.({
      setVolume: () => undefined,
      getVolume: () => 1,
      setMuted: () => undefined,
      getMuted: () => false,
      setRate: (rate) => {
        // react-native-video exposes rate via imperative handle in v6 when available
        const v = ref.current as VideoRef & { setRate?: (r: number) => void };
        v?.setRate?.(rate);
      },
      getRate: () => 1,
      requestFullscreen: () => undefined,
      exitFullscreen: () => undefined,
      isFullscreen: () => false,
    });
  }, [props.onTransportReady]);

  const sideloaded = textSubtitles(props.subtitleTracks).map((track) => ({
    title: track.label || track.language || "Subtitle",
    language: (track.language?.slice(0, 2).toLowerCase() || "en") as "en",
    type: track.url.endsWith(".vtt") ? TextTrackType.VTT : TextTrackType.SUBRIP,
    uri: playbackMediaUrl(track.url, origin, props.headers["x-streamerr-session"]),
  }));

  const selectedTextTrack =
    props.subtitleIndex == null
      ? { type: SelectedTrackType.DISABLED }
      : { type: SelectedTrackType.INDEX, value: props.subtitleIndex };

  // iOS AVPlayer does not reliably forward custom headers on HLS segments.
  // Auth is in the query string (playbackMediaUrl / playlist rewrite). Keep
  // headers for progressive DirectPlay/DirectStream (single URL).
  const iosHls = Platform.OS === "ios" && kind === "hls";
  const sourceHeaders = iosHls ? undefined : props.headers;

  return (
    <Video
      ref={ref}
      source={{
        uri: props.uri,
        ...(sourceHeaders ? { headers: sourceHeaders } : {}),
        ...(videoType ? { type: videoType } : {}),
        textTracks: sideloaded,
      }}
      style={StyleSheet.absoluteFill}
      paused={props.paused}
      resizeMode="contain"
      onLoad={(data: OnLoadData) => {
        const d = Number.isFinite(data.duration) && data.duration > 0 ? data.duration : 0;
        props.onLoad({ duration: d });
      }}
      onProgress={(data: OnProgressData) =>
        props.onProgress({
          currentTime: data.currentTime,
          duration:
            Number.isFinite(data.seekableDuration) && data.seekableDuration > 0
              ? data.seekableDuration
              : undefined,
        })
      }
      onEnd={() => props.onEnd()}
      onError={(e) => {
        const err = e.error;
        const detail =
          err?.errorString ||
          err?.localizedDescription ||
          (err?.code != null ? `code ${err.code}` : null) ||
          "Playback failed";
        let where = "";
        try {
          const u = new URL(props.uri);
          where = `${u.host}${u.pathname}`;
        } catch {
          where = props.uri.slice(0, 80);
        }
        console.error("[NativeVideoSurface]", kind, where, detail, err);
        props.onError(`${detail} (${kind} @ ${where})`);
      }}
      selectedTextTrack={selectedTextTrack}
      reportBandwidth
      ignoreSilentSwitch="ignore"
      playInBackground={false}
      controls={false}
      automaticallyWaitsToMinimizeStalling
      controlsStyles={{ hideLiveBadge: true }}
    />
  );
}
