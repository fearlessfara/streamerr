import type { KeyboardEvent, MouseEvent } from "react";
import { useFocusable } from "./FocusContext.js";

export interface MediaCardProps {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  posterUrl?: string;
  progress?: number;
  canPlay?: boolean;
  onSelect: () => void;
  onPlay?: () => void;
  onInfo?: () => void;
  autoFocus?: boolean;
}

export function MediaCard({
  id,
  title,
  subtitle,
  meta,
  posterUrl,
  progress,
  canPlay = true,
  onSelect,
  onPlay,
  onInfo,
  autoFocus,
}: MediaCardProps) {
  const focusProps = useFocusable(id, autoFocus);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const showProgress = progress !== undefined && progress > 0 && progress < 1;
  const infoBits = [subtitle, meta].filter(Boolean);

  return (
    <button
      type="button"
      {...focusProps}
      className={`se-focusable se-card ${focusProps.className}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-label={title}
    >
      <div
        className={`se-card-poster ${posterUrl ? "has-image" : "no-image"}`}
        style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}
      >
        {!posterUrl ? <span className="se-card-placeholder">{title.slice(0, 1)}</span> : null}
        {showProgress ? (
          <div className="se-card-progress">
            <span style={{ width: `${Math.round(progress! * 100)}%` }} />
          </div>
        ) : null}
      </div>
      <div className="se-card-panel">
        <div className="se-card-actions">
          <span
            role="button"
            tabIndex={-1}
            className={`se-card-action primary${canPlay ? "" : " is-disabled"}`}
            title={canPlay ? "Play" : "More info"}
            onClick={(e) => {
              stop(e);
              if (canPlay && onPlay) onPlay();
              else if (onInfo) onInfo();
              else onSelect();
            }}
          >
            ▶
          </span>
          <span
            role="button"
            tabIndex={-1}
            className="se-card-action"
            title="More info"
            onClick={(e) => {
              stop(e);
              if (onInfo) onInfo();
              else onSelect();
            }}
          >
            ℹ
          </span>
        </div>
        <div className="se-card-panel-title">{title}</div>
        {infoBits.length ? (
          <div className="se-card-panel-sub">{infoBits.join(" · ")}</div>
        ) : null}
        {showProgress ? (
          <div className="se-card-progress" style={{ position: "relative", marginTop: "0.55rem" }}>
            <span style={{ width: `${Math.round(progress! * 100)}%` }} />
          </div>
        ) : null}
      </div>
    </button>
  );
}
