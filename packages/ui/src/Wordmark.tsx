import type { CSSProperties } from "react";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div style={size === "lg" ? wrapLg : wrapMd} aria-label="Streamerr">
      <span style={size === "lg" ? nameLg : name}>STREAMERR</span>
    </div>
  );
}

const wrapMd: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
};

const wrapLg: CSSProperties = {
  ...wrapMd,
};

const name: CSSProperties = {
  fontFamily: "var(--se-font-display)",
  fontSize: "1.55rem",
  letterSpacing: "-0.02em",
  fontWeight: 800,
  color: "var(--se-accent)",
  lineHeight: 1,
  textTransform: "uppercase",
};

const nameLg: CSSProperties = {
  ...name,
  fontSize: "2.4rem",
  letterSpacing: "-0.03em",
};
