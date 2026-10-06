import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MediaCard, Rail } from "@streamerr/ui";
import type { Media } from "@streamerr/shared";
import { resolvePlaybackForPlay } from "../lib/api";
import { canPlayMedia, cardBadge, formatRuntime, mediaHref } from "../lib/media";

export function MediaRailSection({
  id,
  title,
  items,
  emptyText = "Nothing here yet.",
  autoFocusFirst = false,
}: {
  id: string;
  title: string;
  items: Media[];
  emptyText?: string;
  autoFocusFirst?: boolean;
}) {
  const navigate = useNavigate();
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);

  const playMedia = useMutation({
    mutationFn: async (media: Media) => {
      setBufferStatus("Resolving…");
      const source = await resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            setBufferStatus(
              `Buffering… ${Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))}%`,
            );
          } else {
            setBufferStatus(`Buffering… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      });
      return {
        source,
        title: media.metadata.title,
        identity: media.identity,
      };
    },
    onSuccess: ({ source, title, identity }) => {
      setBufferStatus(null);
      navigate("/play", { state: { source, title, identity } });
    },
    onError: (_err, media) => {
      setBufferStatus(null);
      const href = mediaHref(media);
      if (href) navigate(href);
    },
  });

  return (
    <Rail title={title}>
      {bufferStatus ? <p className="rail-buffer-status" aria-live="polite">{bufferStatus}</p> : null}
      {items.length === 0 ? (
        <p className="empty-rail" style={{ padding: 0 }}>
          {emptyText}
        </p>
      ) : (
        items.map((item, itemIndex) => {
          const progressAvail = item.availability.find(
            (a) =>
              (a.provider === "jellyfin" ||
                a.provider === "dispatcharr" ||
                a.provider === "cache") &&
              "positionSeconds" in a &&
              typeof a.positionSeconds === "number" &&
              a.positionSeconds > 30 &&
              "durationSeconds" in a &&
              typeof a.durationSeconds === "number" &&
              a.durationSeconds > 0,
          );
          const progress =
            progressAvail &&
            "positionSeconds" in progressAvail &&
            "durationSeconds" in progressAvail &&
            typeof progressAvail.positionSeconds === "number" &&
            typeof progressAvail.durationSeconds === "number"
              ? progressAvail.positionSeconds / progressAvail.durationSeconds
              : undefined;
          const href = mediaHref(item);
          const key =
            item.identity.jellyfinItemId ??
            (item.identity.tmdbId !== undefined
              ? `${item.identity.mediaType}-${item.identity.tmdbId}`
              : `${id}-${itemIndex}`);
          // Series play is episode-level — open details instead of starting playback.
          const playable = canPlayMedia(item) && item.identity.mediaType !== "tv";
          const badge = cardBadge(item);
          const open = () => {
            if (href) navigate(href);
          };
          return (
            <MediaCard
              key={key}
              id={`card-${id}-${key}`}
              title={item.metadata.title}
              subtitle={item.metadata.year ? String(item.metadata.year) : undefined}
              meta={formatRuntime(item.metadata.runtimeMinutes) ?? undefined}
              posterUrl={item.metadata.backdropUrl || item.metadata.posterUrl}
              progress={progress}
              badge={badge}
              canPlay={playable}
              autoFocus={autoFocusFirst && itemIndex === 0}
              onSelect={open}
              onInfo={open}
              onPlay={() => {
                if (playable) playMedia.mutate(item);
                else open();
              }}
            />
          );
        })
      )}
    </Rail>
  );
}
