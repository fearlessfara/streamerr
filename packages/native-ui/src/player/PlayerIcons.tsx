import { createElement, type ReactNode } from "react";
import { Platform, View } from "react-native";

type IconProps = { size?: number; color?: string };

function Svg({
  size,
  children,
  viewBox = "0 0 24 24",
}: {
  size: number;
  children: ReactNode;
  viewBox?: string;
}) {
  if (Platform.OS !== "web") {
    return <View style={{ width: size, height: size }}>{children}</View>;
  }
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox,
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      style: { display: "block" },
    },
    children,
  );
}

function Path(props: Record<string, string | number>) {
  if (Platform.OS !== "web") return null;
  return createElement("path", props);
}

function Circle(props: Record<string, string | number>) {
  if (Platform.OS !== "web") return null;
  return createElement("circle", props);
}

function Line(props: Record<string, string | number>) {
  if (Platform.OS !== "web") return null;
  return createElement("line", props);
}

function Rect(props: Record<string, string | number>) {
  if (Platform.OS !== "web") return null;
  return createElement("rect", props);
}

function Polyline(props: Record<string, string | number>) {
  if (Platform.OS !== "web") return null;
  return createElement("polyline", props);
}

function SvgText(props: Record<string, string | number>, children: string) {
  if (Platform.OS !== "web") return null;
  return createElement("text", props, children);
}

/** Netflix top-left back chevron. */
export function NfBackIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M15.5 5L8 12.5 15.5 20"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Netflix top-right report flag. */
export function NfFlagIcon({ size = 26, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M6 21V4h.5l1.2 1.8c.4.6 1 .9 1.7.9H18l-1.8 5.2L18 16H9.4c-.7 0-1.3.3-1.7.9L6 21"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Solid play triangle. */
export function NfPlayIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path d="M7 4.5v15l13-7.5L7 4.5z" fill={color} />
    </Svg>
  );
}

/** Pause — two bars. */
export function NfPauseIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Rect x={6} y={4} width={4.5} height={16} rx={1} fill={color} />
      <Rect x={13.5} y={4} width={4.5} height={16} rx={1} fill={color} />
    </Svg>
  );
}

/** Counter-clockwise skip with 10. */
export function NfRewind10Icon({ size = 30, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M8.2 8.2A7.2 7.2 0 1 0 12 4.8"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <Path d="M11.2 3.2L12.2 6.6 8.6 5.2" fill={color} />
      {SvgText(
        {
          x: 12,
          y: 14.2,
          fill: color,
          fontSize: 8.5,
          fontWeight: 700,
          fontFamily: "Helvetica Neue, Arial, sans-serif",
          textAnchor: "middle",
          dominantBaseline: "middle",
        },
        "10",
      )}
    </Svg>
  );
}

/** Clockwise skip with 10. */
export function NfForward10Icon({ size = 30, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M15.8 8.2A7.2 7.2 0 1 1 12 4.8"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <Path d="M12.8 3.2L11.8 6.6 15.4 5.2" fill={color} />
      {SvgText(
        {
          x: 12,
          y: 14.2,
          fill: color,
          fontSize: 8.5,
          fontWeight: 700,
          fontFamily: "Helvetica Neue, Arial, sans-serif",
          textAnchor: "middle",
          dominantBaseline: "middle",
        },
        "10",
      )}
    </Svg>
  );
}

/** Speaker + sound waves. */
export function NfVolumeIcon({ size = 28, color = "#fff", muted = false }: IconProps & { muted?: boolean }) {
  return (
    <Svg size={size}>
      <Path d="M4.5 9.5h3.2L12.5 5v14l-4.8-4.5H4.5V9.5z" fill={color} />
      {muted ? (
        <Path d="M15 9l5 6M20 9l-5 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      ) : (
        <>
          <Path d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
          <Path d="M17.6 7a6.2 6.2 0 0 1 0 10" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

/** Next episode: play triangle + end bar. */
export function NfNextEpisodeIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path d="M4 5.5v13l10-6.5L4 5.5z" fill={color} />
      <Rect x={16.5} y={5.5} width={3.2} height={13} rx={0.6} fill={color} />
    </Svg>
  );
}

/** Episodes — overlapping cards. */
export function NfEpisodesIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Rect x={4} y={7} width={12.5} height={9.5} rx={1.2} stroke={color} strokeWidth={1.7} />
      <Rect x={7.5} y={4.5} width={12.5} height={9.5} rx={1.2} stroke={color} strokeWidth={1.7} fill="none" />
    </Svg>
  );
}

/** Audio & subtitles speech bubble. */
export function NfAudioSubsIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Line x1={7} y1={9} x2={17} y2={9} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={7} y1={12} x2={14.5} y2={12} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Playback speed gauge. */
export function NfSpeedIcon({ size = 28, color = "#fff" }: IconProps) {
  return (
    <Svg size={size}>
      <Path
        d="M12 20a8 8 0 1 1 7.2-4.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="M12 12l4.2-3.2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}

/** Fullscreen corners. */
export function NfFullscreenIcon({ size = 26, color = "#fff", exit = false }: IconProps & { exit?: boolean }) {
  if (exit) {
    return (
      <Svg size={size}>
        <Polyline points="9,4 9,9 4,9" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="15,4 15,9 20,9" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="9,20 9,15 4,15" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="15,20 15,15 20,15" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg size={size}>
      <Polyline points="4,9 4,4 9,4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="15,4 20,4 20,9" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="4,15 4,20 9,20" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="15,20 20,20 20,15" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
