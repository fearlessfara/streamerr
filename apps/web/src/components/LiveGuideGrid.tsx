import { useMemo, useRef } from "react";
import type { EpgProgramme, LiveChannel } from "@streamerr/shared";

const PX_PER_MIN = 4;
const SLOT_MIN = 30;

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function LiveGuideGrid({
  channels,
  programmes,
  windowStart,
  windowEnd,
  selectedUuid,
  onSelectChannel,
  onWatch,
}: {
  channels: LiveChannel[];
  programmes: EpgProgramme[];
  windowStart: string;
  windowEnd: string;
  selectedUuid: string | null;
  onSelectChannel: (uuid: string) => void;
  onWatch: (uuid: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const spanMin = Math.max(60, (endMs - startMs) / 60_000);
  const timelineWidth = spanMin * PX_PER_MIN;
  const nowMs = Date.now();
  const nowLeft = clamp(((nowMs - startMs) / 60_000) * PX_PER_MIN, 0, timelineWidth);

  const byChannel = useMemo(() => {
    const map = new Map<string, EpgProgramme[]>();
    const uuidByTvg = new Map<string, string>();
    for (const ch of channels) {
      if (ch.tvgId) uuidByTvg.set(ch.tvgId, ch.uuid);
      map.set(ch.uuid, []);
    }
    for (const p of programmes) {
      const uuid =
        (p.channelUuid && map.has(p.channelUuid) ? p.channelUuid : undefined) ??
        (p.channelId ? uuidByTvg.get(p.channelId) : undefined);
      if (!uuid) continue;
      map.get(uuid)!.push(p);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [channels, programmes]);

  const ticks = useMemo(() => {
    const items: { left: number; label: string }[] = [];
    const start = new Date(windowStart);
    start.setMinutes(Math.floor(start.getMinutes() / SLOT_MIN) * SLOT_MIN, 0, 0);
    for (let t = start.getTime(); t <= endMs; t += SLOT_MIN * 60_000) {
      items.push({
        left: ((t - startMs) / 60_000) * PX_PER_MIN,
        label: formatClock(new Date(t).toISOString()),
      });
    }
    return items;
  }, [windowStart, startMs, endMs]);

  return (
    <div className="live-guide" ref={scrollerRef}>
      <div className="live-guide-inner" style={{ width: timelineWidth + 180 }}>
        <div className="live-guide-header">
          <div className="live-guide-corner">Channel</div>
          <div className="live-guide-timeline" style={{ width: timelineWidth }}>
            {ticks.map((tick) => (
              <span
                key={tick.label + tick.left}
                className="live-guide-tick"
                style={{ left: tick.left }}
              >
                {tick.label}
              </span>
            ))}
            {nowMs >= startMs && nowMs <= endMs ? (
              <span className="live-guide-now-line" style={{ left: nowLeft }} aria-hidden="true" />
            ) : null}
          </div>
        </div>

        {channels.map((ch) => {
          const active = ch.uuid === selectedUuid;
          const progs = byChannel.get(ch.uuid) ?? [];
          return (
            <div
              key={ch.uuid}
              className={`live-guide-row${active ? " active" : ""}`}
              onClick={() => onSelectChannel(ch.uuid)}
            >
              <button
                type="button"
                className="live-guide-ch"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChannel(ch.uuid);
                }}
                onDoubleClick={() => onWatch(ch.uuid)}
              >
                <span className="live-guide-ch-num">{ch.number ?? "—"}</span>
                <span className="live-guide-ch-name">{ch.name}</span>
              </button>
              <div className="live-guide-track" style={{ width: timelineWidth }}>
                {nowMs >= startMs && nowMs <= endMs ? (
                  <span className="live-guide-now-line" style={{ left: nowLeft }} aria-hidden="true" />
                ) : null}
                {progs.map((p) => {
                  const pStart = new Date(p.startsAt).getTime();
                  const pEnd = new Date(p.endsAt).getTime();
                  if (Number.isNaN(pStart) || Number.isNaN(pEnd) || pEnd <= startMs || pStart >= endMs) {
                    return null;
                  }
                  const left = ((Math.max(pStart, startMs) - startMs) / 60_000) * PX_PER_MIN;
                  const width = Math.max(
                    24,
                    ((Math.min(pEnd, endMs) - Math.max(pStart, startMs)) / 60_000) * PX_PER_MIN,
                  );
                  const isNow = pStart <= nowMs && nowMs < pEnd;
                  return (
                    <button
                      key={`${ch.uuid}-${p.startsAt}-${p.title}`}
                      type="button"
                      className={`live-guide-prog${isNow ? " is-live" : ""}`}
                      style={{ left, width }}
                      title={`${p.title}\n${formatClock(p.startsAt)} – ${formatClock(p.endsAt)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChannel(ch.uuid);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onWatch(ch.uuid);
                      }}
                    >
                      <span className="live-guide-prog-title">{p.title}</span>
                      <span className="live-guide-prog-time">
                        {formatClock(p.startsAt)} – {formatClock(p.endsAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
