import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MediaCard } from "@streamerr/ui";
import type { Media } from "@streamerr/shared";
import { resolvePlaybackForPlay } from "@streamerr/client";
import { canPlayMedia, formatRuntime, mediaHref } from "@streamerr/client";

export function MediaGrid({
  id,
  items,
  emptyText = "Nothing here yet.",
  autoFocusFirst = false,
}: {
  id: string;
  items: Media[];
  emptyText?: string;
  autoFocusFirst?: boolean;
}) {
  const navigate = useNavigate();

  const playMedia = useMutation({
    mutationFn: async (media: Media) => {
      const source = await resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
      });
      return {
        source,
        title: media.metadata.title,
        identity: media.identity,
      };
    },
    onSuccess: ({ source, title, identity }) => {
      navigate("/play", { state: { source, title, identity } });
    },
    onError: (_err, media) => {
      const href = mediaHref(media);
      if (href) navigate(href);
    },
  });

  if (items.length === 0) {
    return <p className="empty-rail">{emptyText}</p>;
  }

  return (
    <div className="media-grid">
      {items.map((item, itemIndex) => {
        const jf = item.availability.find((a) => a.provider === "jellyfin");
        const progress =
          jf && "positionSeconds" in jf && jf.positionSeconds && jf.durationSeconds
            ? jf.positionSeconds / jf.durationSeconds
            : undefined;
        const href = mediaHref(item);
        const key =
          item.identity.jellyfinItemId ??
          (item.identity.tmdbId !== undefined
            ? `${item.identity.mediaType}-${item.identity.tmdbId}`
            : `${id}-${itemIndex}`);
        const playable = canPlayMedia(item);
        const open = () => {
          if (href) navigate(href);
        };
        return (
          <MediaCard
            key={key}
            id={`grid-${id}-${key}`}
            title={item.metadata.title}
            subtitle={item.metadata.year ? String(item.metadata.year) : undefined}
            meta={formatRuntime(item.metadata.runtimeMinutes) ?? undefined}
            posterUrl={item.metadata.backdropUrl || item.metadata.posterUrl}
            progress={progress}
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
      })}
    </div>
  );
}
