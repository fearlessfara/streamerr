import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import type { VideoSurfaceProps } from "@streamerr/native-ui";
import { absolutePlaybackUrl, attachWebPlayback } from "./attach.js";
import { getClient } from "@streamerr/client";

type WebKitVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitEnterFullscreen?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
  disableRemotePlayback?: boolean;
};

/**
 * RN-web video surface backed by HTMLVideoElement + hls.js/mpegts.js.
 * Opted into Safari AirPlay (native HLS preferred; MSE gets an HLS <source> fallback).
 */
export function WebVideoSurface(props: VideoSurfaceProps) {
  const hostRef = useRef<View>(null);
  const videoRef = useRef<WebKitVideo | null>(null);
  const handleRef = useRef<ReturnType<typeof attachWebPlayback> | null>(null);
  const airplayAvailable = useRef(false);
  const airplayListeners = useRef(new Set<() => void>());
  const transportCb = useRef(props.onTransportReady);
  transportCb.current = props.onTransportReady;

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const video = document.createElement("video") as WebKitVideo;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x-webkit-airplay", "allow");
    video.disableRemotePlayback = false;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.style.background = "#000";
    host.appendChild(video);
    videoRef.current = video;

    const notifyAirPlay = () => {
      for (const fn of airplayListeners.current) fn();
    };

    const onAvailability = (event: Event) => {
      const availability = (event as Event & { availability?: string }).availability;
      airplayAvailable.current = availability === "available";
      notifyAirPlay();
    };
    const onWireless = () => notifyAirPlay();

    video.addEventListener("webkitplaybacktargetavailabilitychanged", onAvailability);
    video.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);

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
        else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      },
      exitFullscreen: async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      },
      isFullscreen: () => Boolean(document.fullscreenElement),
      showAirPlayPicker: () => {
        video.webkitShowPlaybackTargetPicker?.();
      },
      isAirPlayAvailable: () => airplayAvailable.current,
      isAirPlayActive: () => Boolean(video.webkitCurrentPlaybackTargetIsWireless),
      onAirPlayChange: (listener) => {
        airplayListeners.current.add(listener);
        return () => {
          airplayListeners.current.delete(listener);
        };
      },
    });

    return () => {
      video.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvailability);
      video.removeEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);
      handleRef.current?.destroy();
      handleRef.current = null;
      video.remove();
      videoRef.current = null;
    };
  }, []);

  const seekCb = useRef(props.onSeekRequest);
  seekCb.current = props.onSeekRequest;
  const progressCb = useRef(props.onProgress);
  progressCb.current = props.onProgress;
  const loadCb = useRef(props.onLoad);
  loadCb.current = props.onLoad;
  const endCb = useRef(props.onEnd);
  endCb.current = props.onEnd;
  const errorCb = useRef(props.onError);
  errorCb.current = props.onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    handleRef.current?.destroy();
    const origin = getClient().baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    // Prefer PlayerScreen's session-bearing uri so AirPlay receivers can fetch HLS
    // without browser cookies (Apple TV loads the playlist directly).
    const playUrl = props.uri || absolutePlaybackUrl(props.source, origin);
    const source = {
      ...props.source,
      delivery: { ...props.source.delivery, url: playUrl },
    };
    handleRef.current = attachWebPlayback(video, {
      source,
      paused: props.paused,
      startPosition: props.startPositionSeconds,
      onProgress: (info) => progressCb.current(info),
      onLoad: (info) => loadCb.current?.(info),
      onEnd: () => endCb.current(),
      onError: (msg) => errorCb.current(msg),
    });
    // Keep a stable seek bridge so PlayerScreen always has a live seek fn.
    seekCb.current?.((seconds) => handleRef.current?.seek(seconds));
    if (props.paused) handleRef.current.pause();
    else handleRef.current.play();
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Intentionally re-attach only when the stream identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.uri, props.source.delivery.url, props.source.playSessionId]);

  // Re-publish seek if the parent callback identity changes after attach.
  useEffect(() => {
    props.onSeekRequest?.((seconds) => handleRef.current?.seek(seconds));
  }, [props.onSeekRequest]);

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
