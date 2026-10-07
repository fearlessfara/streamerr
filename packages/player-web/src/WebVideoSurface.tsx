import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import type { VideoSurfaceProps } from "@streamerr/native-ui";
import { absolutePlaybackUrl, attachWebPlayback } from "./attach.js";
import { getClient } from "@streamerr/client";

/** RN-web video surface backed by HTMLVideoElement + hls.js/mpegts.js. */
export function WebVideoSurface(props: VideoSurfaceProps) {
  const hostRef = useRef<View>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handleRef = useRef<ReturnType<typeof attachWebPlayback> | null>(null);
  const transportCb = useRef(props.onTransportReady);
  transportCb.current = props.onTransportReady;

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.style.background = "#000";
    host.appendChild(video);
    videoRef.current = video;

    const fsTarget = () => host.closest("[data-player-root]") ?? host;

    transportCb.current?.({
      setVolume: (v) => {
        video.volume = Math.min(1, Math.max(0, v));
      },
      getVolume: () => video.volume,
      setMuted: (m) => {
        video.muted = m;
      },
      getMuted: () => video.muted,
      setRate: (r) => {
        video.playbackRate = r;
      },
      getRate: () => video.playbackRate,
      requestFullscreen: async () => {
        const el = fsTarget() as HTMLElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
          (video as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
        }
      },
      exitFullscreen: async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      },
      isFullscreen: () => Boolean(document.fullscreenElement),
    });

    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
      video.remove();
      videoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    handleRef.current?.destroy();
    const origin = getClient().baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const source = {
      ...props.source,
      delivery: { ...props.source.delivery, url: absolutePlaybackUrl(props.source, origin) },
    };
    handleRef.current = attachWebPlayback(video, {
      source,
      paused: props.paused,
      startPosition: props.startPositionSeconds,
      onProgress: props.onProgress,
      onLoad: props.onLoad,
      onEnd: props.onEnd,
      onError: props.onError,
    });
    props.onSeekRequest?.((seconds) => handleRef.current?.seek(seconds));
    if (props.paused) handleRef.current.pause();
    else handleRef.current.play();
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Intentionally re-attach only when the stream identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.source.delivery.url, props.source.playSessionId]);

  useEffect(() => {
    if (!handleRef.current) return;
    if (props.paused) handleRef.current.pause();
    else handleRef.current.play();
  }, [props.paused]);

  return <View ref={hostRef} style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
});
